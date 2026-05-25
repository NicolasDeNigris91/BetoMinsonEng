import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import * as schema from "../src/db/schema";

type Tx = ReturnType<typeof drizzle<typeof schema>>;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[seed] DATABASE_URL not set");
    process.exit(1);
  }

  const client = postgres(url, { max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema });

  try {
    console.log("[seed] limpando dados existentes (TRUNCATE)");
    await db.execute(sql`
      TRUNCATE TABLE
        fotos,
        achado_eventos,
        share_tokens,
        escopo_share_tokens,
        escopo_achados,
        escopos,
        achados,
        vistorias,
        unidades,
        empreendimentos,
        usuarios,
        rate_limit_buckets
      RESTART IDENTITY CASCADE
    `);

    const tokens: { escopo: string; url: string }[] = [];

    // ===================================================================
    // EMPREENDIMENTO 1: Residencial Vista Mar
    //   - 2 unidades, escopos do Joao, Pedro, Carlos
    //   - Demonstra: persistencia ativa, ordem concluida, ordem aguardando
    // ===================================================================
    await seedVistaMar(db, tokens);

    // ===================================================================
    // EMPREENDIMENTO 2: Edificio Marquise (corporativo)
    //   - 3 andares, escopos Bruno (eletrica) + Sara (hvac)
    // ===================================================================
    await seedMarquise(db, tokens);

    // ===================================================================
    // EMPREENDIMENTO 3: Condominio Solar do Lago
    //   - 4 casas, escopos Marcelo (acabamento) + Diego (hidraulica)
    // ===================================================================
    await seedSolarDoLago(db, tokens);

    // ===================================================================
    // EMPREENDIMENTO 4: Comercial Centro (sem escopo ainda)
    //   - 1 loja, vistoria em rascunho, achados em aberto sem prazo
    // ===================================================================
    await seedComercialCentro(db);

    // ===================================================================
    // EMPREENDIMENTO 5: Residencial Parque Verde
    //   - 6 casas, escopos Lucas (pisos), Bia (pintura), Felipe (vidracaria)
    // ===================================================================
    await seedParqueVerde(db, tokens);

    console.log("\n[seed] OK\n");
    console.log("Logins: senha 206055@ (do .env.local)");
    console.log("\nLinks de profissional ativos:");
    for (const t of tokens) {
      console.log(`  ${t.escopo.padEnd(40)} ${t.url}`);
    }
  } catch (err) {
    console.error("[seed] FAILED:");
    console.error(err);
    process.exitCode = 1;
  } finally {
    await client.end({ timeout: 5 });
  }
}

main();

// ===================================================================
// helpers
// ===================================================================

function isoDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function isoTs(daysAgo: number, hour = 14): Date {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return d;
}

function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}

function tokenFor(slug: string): string {
  // 64 chars total, ascii minusculo. Padding com 'x' pra bater no varchar(64).
  const base = `mock-${slug}-`;
  return (base + "x".repeat(80)).slice(0, 64);
}

async function criarEscopoComToken(
  db: Tx,
  params: {
    empId: string;
    empNome: string;
    nome: string;
    descricao?: string;
    achadoIds: string[];
    tokenSlug: string;
    tokens: { escopo: string; url: string }[];
  },
): Promise<string> {
  const [esc] = await db
    .insert(schema.escopos)
    .values({
      empreendimentoId: params.empId,
      nome: params.nome,
      descricao: params.descricao ?? null,
    })
    .returning();

  await db.insert(schema.escopoAchados).values(
    params.achadoIds.map((id, i) => ({
      escopoId: esc.id,
      achadoId: id,
      ordem: i,
    })),
  );

  const token = tokenFor(params.tokenSlug);
  await db.insert(schema.escopoShareTokens).values({
    escopoId: esc.id,
    token,
  });

  params.tokens.push({
    escopo: `${params.empNome} · ${params.nome}`,
    url: `http://localhost:3000/v/${token}/profissional`,
  });

  return esc.id;
}

/**
 * Marca um achado como resolvido via escopo (UPDATE do evento criado +
 * UPDATE do status do achado). Mimika o que applyAchadoStateInVistoria
 * faz quando o profissional aciona via link — inclusive atualizar
 * createdAt pra now(), porque o estado atual foi registrado agora.
 *
 * @param minutosAtras quanto tempo atras o profissional "resolveu" (pra
 *   dar variedade na atividade recente do painel mock).
 */
async function resolverViaEscopo(
  db: Tx,
  achadoId: string,
  vistoriaId: string,
  escopoId: string,
  nota?: string,
  minutosAtras = 0,
): Promise<void> {
  const at = new Date(Date.now() - minutosAtras * 60 * 1000);
  await db
    .update(schema.achadoEventos)
    .set({
      tipo: "resolvido",
      notaExtra: nota ?? null,
      escopoOrigemId: escopoId,
      createdAt: at,
    })
    .where(
      sql`achado_id = ${achadoId} AND vistoria_id = ${vistoriaId}`,
    );
  await db
    .update(schema.achados)
    .set({ status: "resolvido", vistoriaResolvidoId: vistoriaId })
    .where(sql`id = ${achadoId}`);
}

async function persisteViaEscopo(
  db: Tx,
  achadoId: string,
  vistoriaId: string,
  escopoId: string,
  nota: string,
  minutosAtras = 0,
): Promise<void> {
  const at = new Date(Date.now() - minutosAtras * 60 * 1000);
  await db
    .update(schema.achadoEventos)
    .set({
      tipo: "persiste",
      notaExtra: nota,
      escopoOrigemId: escopoId,
      createdAt: at,
    })
    .where(
      sql`achado_id = ${achadoId} AND vistoria_id = ${vistoriaId}`,
    );
}

// ===================================================================
// EMPREENDIMENTO 1: Residencial Vista Mar
// ===================================================================
async function seedVistaMar(
  db: Tx,
  tokens: { escopo: string; url: string }[],
): Promise<void> {
  console.log("[seed] Residencial Vista Mar");

  const [emp] = await db
    .insert(schema.empreendimentos)
    .values({
      nome: "Residencial Vista Mar",
      cliente: "Acme Incorporadora",
      endereco: "Av. Atlantica 1500, Balneario Camboriu, SC",
      observacoes:
        "Empreendimento de 24 unidades em fase de entrega. Vistorias em curso.",
    })
    .returning();

  const [apto101, apto202] = await db
    .insert(schema.unidades)
    .values([
      { empreendimentoId: emp.id, nome: "Apto 101", ordem: 0 },
      { empreendimentoId: emp.id, nome: "Apto 202", ordem: 1 },
    ])
    .returning();

  const [vist101a] = await db
    .insert(schema.vistorias)
    .values({
      unidadeId: apto101.id,
      data: isoDate(15),
      vistoriadorNome: "Roberto Minson",
      status: "finalizada",
      createdAt: isoTs(15, 9),
      finalizadaEm: isoTs(15, 18),
    })
    .returning();

  const [v202a, v202b, v202c] = await db
    .insert(schema.vistorias)
    .values([
      {
        unidadeId: apto202.id,
        data: isoDate(70),
        vistoriadorNome: "Roberto Minson",
        status: "finalizada",
        createdAt: isoTs(70, 9),
        finalizadaEm: isoTs(70, 17),
      },
      {
        unidadeId: apto202.id,
        data: isoDate(35),
        vistoriadorNome: "Roberto Minson",
        status: "finalizada",
        createdAt: isoTs(35, 9),
        finalizadaEm: isoTs(35, 17),
      },
      {
        unidadeId: apto202.id,
        data: isoDate(3),
        vistoriadorNome: "Roberto Minson",
        status: "rascunho",
        createdAt: isoTs(3, 9),
      },
    ])
    .returning();

  const achados101 = await db
    .insert(schema.achados)
    .values([
      {
        unidadeId: apto101.id,
        categoria: "ELE",
        local: "Sala — tomada parede sul",
        descricao: "Tomada com polaridade invertida no circuito da sala.",
        status: "aberto",
        vistoriaOrigemId: vist101a.id,
        ordem: 0,
      },
      {
        unidadeId: apto101.id,
        categoria: "HID",
        local: "Banheiro suite — chuveiro",
        descricao: "Vazamento no registro do chuveiro principal.",
        status: "aberto",
        vistoriaOrigemId: vist101a.id,
        ordem: 1,
      },
    ])
    .returning();

  const achados202 = await db
    .insert(schema.achados)
    .values([
      {
        unidadeId: apto202.id,
        categoria: "ELE",
        local: "Cozinha — quadro de disjuntores",
        descricao: "Disjuntor sem identificacao do circuito.",
        status: "resolvido",
        vistoriaOrigemId: v202a.id,
        vistoriaResolvidoId: v202b.id,
        ordem: 0,
      },
      {
        unidadeId: apto202.id,
        categoria: "HVAC",
        local: "Quarto principal — split",
        descricao:
          "Dreno do split com inclinacao insuficiente, escorrendo na parede.",
        status: "aberto",
        vistoriaOrigemId: v202a.id,
        prazoEm: isoDate(-15), // prazo +15 dias
        ordem: 1,
      },
      {
        unidadeId: apto202.id,
        categoria: "PISCINA",
        local: "Varanda — banheira de hidro",
        descricao: "Banheira de hidro nao aciona um dos jatos.",
        status: "aberto",
        vistoriaOrigemId: v202b.id,
        ordem: 2,
      },
    ])
    .returning();

  await db.insert(schema.achadoEventos).values([
    {
      achadoId: achados101[0].id,
      vistoriaId: vist101a.id,
      tipo: "criado",
      createdAt: isoTs(15, 10),
    },
    {
      achadoId: achados101[1].id,
      vistoriaId: vist101a.id,
      tipo: "criado",
      createdAt: isoTs(15, 11),
    },

    {
      achadoId: achados202[0].id,
      vistoriaId: v202a.id,
      tipo: "criado",
      createdAt: isoTs(70, 10),
    },
    {
      achadoId: achados202[0].id,
      vistoriaId: v202b.id,
      tipo: "resolvido",
      notaExtra: "Disjuntores identificados com etiqueta laminada.",
      createdAt: isoTs(35, 12),
    },

    {
      achadoId: achados202[1].id,
      vistoriaId: v202a.id,
      tipo: "criado",
      createdAt: isoTs(70, 11),
    },
    {
      achadoId: achados202[1].id,
      vistoriaId: v202b.id,
      tipo: "persiste",
      notaExtra: "Ainda escorrendo. Aguardando ajuste do instalador.",
      createdAt: isoTs(35, 13),
    },
    {
      achadoId: achados202[1].id,
      vistoriaId: v202c.id,
      tipo: "persiste",
      notaExtra: "Instalador agendou retorno dia 30/05.",
      createdAt: isoTs(3, 11),
    },

    {
      achadoId: achados202[2].id,
      vistoriaId: v202b.id,
      tipo: "criado",
      createdAt: isoTs(35, 14),
    },
    {
      achadoId: achados202[2].id,
      vistoriaId: v202c.id,
      tipo: "nota",
      notaExtra: "Acionou tecnico do fabricante.",
      createdAt: isoTs(3, 12),
    },
  ]);

  // Escopo 1: Joao — Eletricista (em servico, com persiste)
  const escJoao = await criarEscopoComToken(db, {
    empId: emp.id,
    empNome: emp.nome,
    nome: "Joao — Eletricista",
    descricao:
      "Itens pendentes do servico do Joao. Marque resolvido ou persiste e anexe foto.",
    achadoIds: [
      achados101[0].id,
      achados101[1].id,
      achados202[1].id,
      achados202[2].id,
    ],
    tokenSlug: "joao-eletricista",
    tokens,
  });
  // Joao resolveu a tomada ha pouco + marcou persiste no chuveiro ha 1h
  await resolverViaEscopo(
    db,
    achados101[0].id,
    vist101a.id,
    escJoao,
    "Tomada invertida ja corrigida no quadro.",
    25,
  );
  await persisteViaEscopo(
    db,
    achados101[1].id,
    vist101a.id,
    escJoao,
    "Aguardando peca do fabricante. Retorno previsto pra 30/05.",
    60,
  );

  // Escopo 2: Pedro — Pintura (concluido)
  const achadosPintura = await db
    .insert(schema.achados)
    .values([
      {
        unidadeId: apto202.id,
        categoria: "SIS",
        local: "Sala — parede norte",
        descricao: "Retoque de pintura na parede da sala.",
        status: "resolvido",
        vistoriaOrigemId: v202a.id,
        vistoriaResolvidoId: v202a.id,
        ordem: 10,
      },
      {
        unidadeId: apto202.id,
        categoria: "SIS",
        local: "Cozinha — rodape",
        descricao: "Rodape solto perto da geladeira.",
        status: "resolvido",
        vistoriaOrigemId: v202a.id,
        vistoriaResolvidoId: v202a.id,
        ordem: 11,
      },
    ])
    .returning();

  const escPedro = await criarEscopoComToken(db, {
    empId: emp.id,
    empNome: emp.nome,
    nome: "Pedro — Pintura e acabamento",
    descricao: "Retoques finais antes da entrega.",
    achadoIds: [achadosPintura[0].id, achadosPintura[1].id],
    tokenSlug: "pedro-pintura",
    tokens,
  });
  // Pedro resolveu os 2 ha algumas horas — insere ja como resolvido.
  // Sao achados que existiam apenas no escopo (sem evento 'criado' antes)
  // entao o registro de 'resolvido' carrega o timestamp da acao.
  await db.insert(schema.achadoEventos).values([
    {
      achadoId: achadosPintura[0].id,
      vistoriaId: v202a.id,
      tipo: "resolvido",
      notaExtra: "Retoque aprovado.",
      escopoOrigemId: escPedro,
      createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
    },
    {
      achadoId: achadosPintura[1].id,
      vistoriaId: v202a.id,
      tipo: "resolvido",
      notaExtra: "Rodape recolocado.",
      escopoOrigemId: escPedro,
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    },
  ]);

  // Escopo 3: Carlos — HVAC e Piscina (aguardando — sem atividade)
  await criarEscopoComToken(db, {
    empId: emp.id,
    empNome: emp.nome,
    nome: "Carlos — HVAC e Piscina",
    descricao: "Itens de climatizacao e hidromassagem.",
    achadoIds: [achados202[1].id, achados202[2].id],
    tokenSlug: "carlos-hvac",
    tokens,
  });
}

// ===================================================================
// EMPREENDIMENTO 2: Edificio Marquise (corporativo)
// ===================================================================
async function seedMarquise(
  db: Tx,
  tokens: { escopo: string; url: string }[],
): Promise<void> {
  console.log("[seed] Edificio Marquise");

  const [emp] = await db
    .insert(schema.empreendimentos)
    .values({
      nome: "Edificio Marquise",
      cliente: "Marquise Empreendimentos",
      endereco: "R. das Palmeiras 880, Itajai, SC",
      observacoes: "Edificio corporativo, 3 andares concluidos.",
    })
    .returning();

  const andares = await db
    .insert(schema.unidades)
    .values([
      { empreendimentoId: emp.id, nome: "Terreo — recepcao", ordem: 0 },
      { empreendimentoId: emp.id, nome: "1o andar — coworking", ordem: 1 },
      { empreendimentoId: emp.id, nome: "2o andar — escritorios", ordem: 2 },
    ])
    .returning();

  // Uma vistoria finalizada por andar
  const vistorias = await db
    .insert(schema.vistorias)
    .values([
      {
        unidadeId: andares[0].id,
        data: isoDate(20),
        vistoriadorNome: "Roberto Minson",
        status: "finalizada",
        createdAt: isoTs(20, 9),
        finalizadaEm: isoTs(20, 15),
      },
      {
        unidadeId: andares[1].id,
        data: isoDate(18),
        vistoriadorNome: "Roberto Minson",
        status: "finalizada",
        createdAt: isoTs(18, 9),
        finalizadaEm: isoTs(18, 16),
      },
      {
        unidadeId: andares[2].id,
        data: isoDate(10),
        vistoriadorNome: "Roberto Minson",
        status: "finalizada",
        createdAt: isoTs(10, 9),
        finalizadaEm: isoTs(10, 17),
      },
    ])
    .returning();

  const achados = await db
    .insert(schema.achados)
    .values([
      // terreo
      {
        unidadeId: andares[0].id,
        vistoriaOrigemId: vistorias[0].id,
        categoria: "ELE",
        local: "Recepcao — luminaria central",
        descricao: "Luminaria pisca intermitentemente.",
        status: "aberto",
        prazoEm: isoDate(2),
        ordem: 0,
      },
      {
        unidadeId: andares[0].id,
        vistoriaOrigemId: vistorias[0].id,
        categoria: "HVAC",
        local: "Recepcao — ar condicionado",
        descricao: "Ruido excessivo no compressor.",
        status: "aberto",
        ordem: 1,
      },
      {
        unidadeId: andares[0].id,
        vistoriaOrigemId: vistorias[0].id,
        categoria: "ELE",
        local: "Hall — tomada lateral",
        descricao: "Tomada sem energia.",
        status: "aberto",
        prazoEm: isoDate(-7),
        ordem: 2,
      },
      // 1o andar
      {
        unidadeId: andares[1].id,
        vistoriaOrigemId: vistorias[1].id,
        categoria: "ELE",
        local: "Coworking — bancada compartilhada",
        descricao: "3 tomadas USB sem funcionar.",
        status: "aberto",
        prazoEm: isoDate(5),
        ordem: 0,
      },
      {
        unidadeId: andares[1].id,
        vistoriaOrigemId: vistorias[1].id,
        categoria: "HVAC",
        local: "Coworking — duto central",
        descricao: "Vazamento de ar no duto principal.",
        status: "aberto",
        ordem: 1,
      },
      // 2o andar
      {
        unidadeId: andares[2].id,
        vistoriaOrigemId: vistorias[2].id,
        categoria: "HVAC",
        local: "Sala reuniao — split",
        descricao: "Split nao gela.",
        status: "aberto",
        prazoEm: isoDate(-3),
        ordem: 0,
      },
      {
        unidadeId: andares[2].id,
        vistoriaOrigemId: vistorias[2].id,
        categoria: "SIS",
        local: "Sala reuniao — projetor",
        descricao: "Conexao HDMI intermitente no rack.",
        status: "aberto",
        ordem: 1,
      },
    ])
    .returning();

  // Eventos criados pra cada achado, alinhados com o createdAt da vistoria
  const vCreatedAt = new Map(vistorias.map((v) => [v.id, v.createdAt]));
  await db.insert(schema.achadoEventos).values(
    achados.map((a, i) => ({
      achadoId: a.id,
      vistoriaId: a.vistoriaOrigemId,
      tipo: "criado" as const,
      createdAt: addMinutes(vCreatedAt.get(a.vistoriaOrigemId)!, 30 + i * 5),
    })),
  );

  // Escopo Bruno — Eletrica predial (em servico)
  const escBruno = await criarEscopoComToken(db, {
    empId: emp.id,
    empNome: emp.nome,
    nome: "Bruno — Eletrica predial",
    descricao: "Itens eletricos do predio inteiro.",
    achadoIds: [achados[0].id, achados[2].id, achados[3].id],
    tokenSlug: "bruno-eletrica",
    tokens,
  });
  // Bruno ja resolveu a luminaria do terreo
  await resolverViaEscopo(
    db,
    achados[0].id,
    achados[0].vistoriaOrigemId,
    escBruno,
    "Reator trocado, luminaria estabilizada.",
    90,
  );

  // Escopo Sara — HVAC central (concluido)
  const escSara = await criarEscopoComToken(db, {
    empId: emp.id,
    empNome: emp.nome,
    nome: "Sara — HVAC central",
    descricao: "Climatizacao geral.",
    achadoIds: [achados[1].id, achados[4].id, achados[5].id],
    tokenSlug: "sara-hvac",
    tokens,
  });
  // Sara resolveu os 3 ao longo do dia
  await resolverViaEscopo(
    db,
    achados[1].id,
    achados[1].vistoriaOrigemId,
    escSara,
    "Compressor balanceado, ruido normalizado.",
    240,
  );
  await resolverViaEscopo(
    db,
    achados[4].id,
    achados[4].vistoriaOrigemId,
    escSara,
    "Vedacao do duto refeita.",
    180,
  );
  await resolverViaEscopo(
    db,
    achados[5].id,
    achados[5].vistoriaOrigemId,
    escSara,
    "Recarga de gas executada.",
    45,
  );
}

// ===================================================================
// EMPREENDIMENTO 3: Condominio Solar do Lago
// ===================================================================
async function seedSolarDoLago(
  db: Tx,
  tokens: { escopo: string; url: string }[],
): Promise<void> {
  console.log("[seed] Condominio Solar do Lago");

  const [emp] = await db
    .insert(schema.empreendimentos)
    .values({
      nome: "Condominio Solar do Lago",
      cliente: "Lago Sul Construtora",
      endereco: "Estrada do Lago km 4, Camboriu, SC",
    })
    .returning();

  const casas = await db
    .insert(schema.unidades)
    .values(
      [1, 2, 3, 4].map((n) => ({
        empreendimentoId: emp.id,
        nome: `Casa ${n}`,
        ordem: n - 1,
      })),
    )
    .returning();

  const vistorias = await db
    .insert(schema.vistorias)
    .values(
      casas.map((c, i) => ({
        unidadeId: c.id,
        data: isoDate(40 - i * 3),
        vistoriadorNome: "Roberto Minson",
        status: "finalizada" as const,
        createdAt: isoTs(40 - i * 3, 9),
        finalizadaEm: isoTs(40 - i * 3, 14 + i),
      })),
    )
    .returning();

  const achados = await db
    .insert(schema.achados)
    .values([
      // Casa 1
      {
        unidadeId: casas[0].id,
        vistoriaOrigemId: vistorias[0].id,
        categoria: "HID",
        local: "Cozinha — pia",
        descricao: "Sifao vazando.",
        status: "aberto",
        ordem: 0,
      },
      {
        unidadeId: casas[0].id,
        vistoriaOrigemId: vistorias[0].id,
        categoria: "SIS",
        local: "Sala — porta de correr",
        descricao: "Trilho da porta de correr emperrado.",
        status: "aberto",
        prazoEm: isoDate(10),
        ordem: 1,
      },
      // Casa 2
      {
        unidadeId: casas[1].id,
        vistoriaOrigemId: vistorias[1].id,
        categoria: "HID",
        local: "Banheiro social — descarga",
        descricao: "Caixa acoplada com pressao baixa.",
        status: "aberto",
        ordem: 0,
      },
      {
        unidadeId: casas[1].id,
        vistoriaOrigemId: vistorias[1].id,
        categoria: "SIS",
        local: "Quintal — portao automatico",
        descricao: "Portao trava ao fechar.",
        status: "aberto",
        prazoEm: isoDate(-2),
        ordem: 1,
      },
      // Casa 3
      {
        unidadeId: casas[2].id,
        vistoriaOrigemId: vistorias[2].id,
        categoria: "SIS",
        local: "Sala — janela frontal",
        descricao: "Borracha de vedacao ressecada.",
        status: "aberto",
        ordem: 0,
      },
      {
        unidadeId: casas[2].id,
        vistoriaOrigemId: vistorias[2].id,
        categoria: "HID",
        local: "Lavanderia — torneira",
        descricao: "Torneira com vazamento na rosca.",
        status: "aberto",
        ordem: 1,
      },
      // Casa 4
      {
        unidadeId: casas[3].id,
        vistoriaOrigemId: vistorias[3].id,
        categoria: "SIS",
        local: "Garagem — piso",
        descricao: "Trinca no piso de concreto perto da entrada.",
        status: "aberto",
        prazoEm: isoDate(20),
        ordem: 0,
      },
      {
        unidadeId: casas[3].id,
        vistoriaOrigemId: vistorias[3].id,
        categoria: "ELE",
        local: "Garagem — sensor de presenca",
        descricao: "Sensor nao aciona.",
        status: "aberto",
        ordem: 1,
      },
    ])
    .returning();

  const vCreatedAtSolar = new Map(vistorias.map((v) => [v.id, v.createdAt]));
  await db.insert(schema.achadoEventos).values(
    achados.map((a, i) => ({
      achadoId: a.id,
      vistoriaId: a.vistoriaOrigemId,
      tipo: "criado" as const,
      createdAt: addMinutes(vCreatedAtSolar.get(a.vistoriaOrigemId)!, 30 + i * 5),
    })),
  );

  // Escopo Marcelo — Acabamento (em servico)
  const escMarcelo = await criarEscopoComToken(db, {
    empId: emp.id,
    empNome: emp.nome,
    nome: "Marcelo — Acabamento",
    descricao: "Esquadrias, portas, pisos.",
    achadoIds: [
      achados[1].id, // trilho porta sala
      achados[3].id, // portao garagem
      achados[4].id, // borracha janela
      achados[6].id, // trinca piso
    ],
    tokenSlug: "marcelo-acabamento",
    tokens,
  });
  // Marcelo resolveu 2 e marcou persiste em 1
  await resolverViaEscopo(
    db,
    achados[1].id,
    achados[1].vistoriaOrigemId,
    escMarcelo,
    "Trilho ajustado e lubrificado.",
    15,
  );
  await resolverViaEscopo(
    db,
    achados[4].id,
    achados[4].vistoriaOrigemId,
    escMarcelo,
    "Borracha substituida.",
    120,
  );
  await persisteViaEscopo(
    db,
    achados[3].id,
    achados[3].vistoriaOrigemId,
    escMarcelo,
    "Motor do portao precisa ser trocado, ja solicitamos pra fornecedor.",
    300,
  );

  // Escopo Diego — Hidraulica (aguardando)
  await criarEscopoComToken(db, {
    empId: emp.id,
    empNome: emp.nome,
    nome: "Diego — Hidraulica",
    descricao: "Vazamentos e pressao de agua.",
    achadoIds: [achados[0].id, achados[2].id, achados[5].id],
    tokenSlug: "diego-hidraulica",
    tokens,
  });
}

// ===================================================================
// EMPREENDIMENTO 4: Comercial Centro
// ===================================================================
async function seedComercialCentro(db: Tx): Promise<void> {
  console.log("[seed] Comercial Centro");

  const [emp] = await db
    .insert(schema.empreendimentos)
    .values({
      nome: "Comercial Centro",
      cliente: "GR Investimentos",
      endereco: "R. XV de Novembro 1200, Itajai, SC",
      observacoes: "Loja terrea no centro. Vistoria inicial em curso.",
    })
    .returning();

  const [loja] = await db
    .insert(schema.unidades)
    .values({
      empreendimentoId: emp.id,
      nome: "Loja terrea",
      ordem: 0,
    })
    .returning();

  // Vistoria em rascunho — alimenta o stat "Rascunhos" do painel
  const [vist] = await db
    .insert(schema.vistorias)
    .values({
      unidadeId: loja.id,
      data: isoDate(0),
      vistoriadorNome: "Roberto Minson",
      status: "rascunho",
      observacoesGerais: "Vistoria em andamento — entregar checklist amanha.",
      // Iniciada ha 4h — vistoria do dia, ainda em andamento
      createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
    })
    .returning();

  const achados = await db
    .insert(schema.achados)
    .values([
      {
        unidadeId: loja.id,
        vistoriaOrigemId: vist.id,
        categoria: "ELE",
        local: "Vitrine — iluminacao LED",
        descricao: "2 spots queimados.",
        status: "aberto",
        ordem: 0,
      },
      {
        unidadeId: loja.id,
        vistoriaOrigemId: vist.id,
        categoria: "HVAC",
        local: "Salao — climatizador",
        descricao: "Filtro precisa ser substituido.",
        status: "aberto",
        ordem: 1,
      },
      {
        unidadeId: loja.id,
        vistoriaOrigemId: vist.id,
        categoria: "SIS",
        local: "Caixa — gaveteiro",
        descricao: "Chave do gaveteiro nao trava.",
        status: "aberto",
        ordem: 2,
      },
      {
        unidadeId: loja.id,
        vistoriaOrigemId: vist.id,
        categoria: "HID",
        local: "Banheiro — descarga",
        descricao: "Descarga continua.",
        status: "aberto",
        prazoEm: isoDate(-1),
        ordem: 3,
      },
    ])
    .returning();

  await db.insert(schema.achadoEventos).values(
    achados.map((a, i) => ({
      achadoId: a.id,
      vistoriaId: vist.id,
      tipo: "criado" as const,
      // Achados criados ao longo da vistoria de hoje (ha 3h, 2h30, 2h, 1h30)
      createdAt: new Date(Date.now() - (3 * 60 - i * 30) * 60 * 1000),
    })),
  );
  // Sem escopo — boa oportunidade pro user criar manualmente no smoke
}

// ===================================================================
// EMPREENDIMENTO 5: Residencial Parque Verde
// ===================================================================
async function seedParqueVerde(
  db: Tx,
  tokens: { escopo: string; url: string }[],
): Promise<void> {
  console.log("[seed] Residencial Parque Verde");

  const [emp] = await db
    .insert(schema.empreendimentos)
    .values({
      nome: "Residencial Parque Verde",
      cliente: "Verde Construtora",
      endereco: "Av. das Acacias 250, Itapema, SC",
    })
    .returning();

  const casas = await db
    .insert(schema.unidades)
    .values(
      [1, 2, 3, 4, 5, 6].map((n) => ({
        empreendimentoId: emp.id,
        nome: `Casa ${n}`,
        ordem: n - 1,
      })),
    )
    .returning();

  const vistorias = await db
    .insert(schema.vistorias)
    .values(
      casas.map((c, i) => ({
        unidadeId: c.id,
        data: isoDate(25 - i),
        vistoriadorNome: "Roberto Minson",
        status: "finalizada" as const,
        createdAt: isoTs(25 - i, 9),
        finalizadaEm: isoTs(25 - i, 16),
      })),
    )
    .returning();

  // 3 achados por casa = 18 achados, cobrindo todas categorias
  const cats: Array<"ELE" | "HID" | "HVAC" | "SIS" | "ASP" | "PISCINA"> = [
    "ELE",
    "HID",
    "SIS",
    "ASP",
    "PISCINA",
    "HVAC",
  ];
  const valores: schema.NovoAchado[] = [];
  for (let i = 0; i < casas.length; i++) {
    const cat = cats[i];
    valores.push(
      {
        unidadeId: casas[i].id,
        vistoriaOrigemId: vistorias[i].id,
        categoria: cat,
        local: `Casa ${i + 1} — ${cat.toLowerCase()} 01`,
        descricao: `Item ${cat} 01 da casa ${i + 1}.`,
        status: "aberto",
        prazoEm: i % 2 === 0 ? isoDate(8 - i * 2) : null,
        ordem: 0,
      },
      {
        unidadeId: casas[i].id,
        vistoriaOrigemId: vistorias[i].id,
        categoria: cat,
        local: `Casa ${i + 1} — ${cat.toLowerCase()} 02`,
        descricao: `Item ${cat} 02 da casa ${i + 1}.`,
        status: "aberto",
        ordem: 1,
      },
      {
        unidadeId: casas[i].id,
        vistoriaOrigemId: vistorias[i].id,
        categoria: "SIS",
        local: `Casa ${i + 1} — acabamento`,
        descricao: `Item de acabamento da casa ${i + 1}.`,
        status: "aberto",
        ordem: 2,
      },
    );
  }
  const achados = await db.insert(schema.achados).values(valores).returning();
  const vCreatedAtParque = new Map(vistorias.map((v) => [v.id, v.createdAt]));
  await db.insert(schema.achadoEventos).values(
    achados.map((a, i) => ({
      achadoId: a.id,
      vistoriaId: a.vistoriaOrigemId,
      tipo: "criado" as const,
      createdAt: addMinutes(vCreatedAtParque.get(a.vistoriaOrigemId)!, 30 + i * 5),
    })),
  );

  // Pisos = SIS de cada casa (12 itens). Lucas concluiu.
  const idsPisos = achados.filter((a) => a.categoria === "SIS").map((a) => a.id);
  const escLucas = await criarEscopoComToken(db, {
    empId: emp.id,
    empNome: emp.nome,
    nome: "Lucas — Pisos",
    descricao: "Pisos e acabamentos.",
    achadoIds: idsPisos,
    tokenSlug: "lucas-pisos",
    tokens,
  });
  // Espalha as resolucoes do Lucas ao longo dos ultimos 2 dias
  for (let i = 0; i < idsPisos.length; i++) {
    const id = idsPisos[i];
    const a = achados.find((x) => x.id === id)!;
    const minutos = 30 + i * 180; // 30min, 3h30, 6h30, ...
    await resolverViaEscopo(
      db,
      id,
      a.vistoriaOrigemId,
      escLucas,
      "Concluido.",
      minutos,
    );
  }

  // Bia — Pintura: pega 3 itens (ASP, PISCINA, HVAC) — em servico
  const idsBia = achados
    .filter((a) => ["ASP", "PISCINA", "HVAC"].includes(a.categoria))
    .map((a) => a.id);
  const escBia = await criarEscopoComToken(db, {
    empId: emp.id,
    empNome: emp.nome,
    nome: "Bia — Pintura",
    descricao: "Pintura externa e interna.",
    achadoIds: idsBia.slice(0, 3),
    tokenSlug: "bia-pintura",
    tokens,
  });
  // Bia resolveu 1 ha pouco e marcou persiste em 1 ha 4h
  if (idsBia[0]) {
    const a = achados.find((x) => x.id === idsBia[0])!;
    await resolverViaEscopo(
      db,
      a.id,
      a.vistoriaOrigemId,
      escBia,
      "Pintado.",
      10,
    );
  }
  if (idsBia[1]) {
    const a = achados.find((x) => x.id === idsBia[1])!;
    await persisteViaEscopo(
      db,
      a.id,
      a.vistoriaOrigemId,
      escBia,
      "Tinta especifica em falta no fornecedor.",
      240,
    );
  }

  // Felipe — Vidracaria (aguardando, sem atividade)
  const idsFelipe = achados
    .filter((a) => a.categoria === "ELE" || a.categoria === "HID")
    .map((a) => a.id)
    .slice(0, 2);
  if (idsFelipe.length > 0) {
    await criarEscopoComToken(db, {
      empId: emp.id,
      empNome: emp.nome,
      nome: "Felipe — Vidracaria",
      descricao: "Janelas e box.",
      achadoIds: idsFelipe,
      tokenSlug: "felipe-vidracaria",
      tokens,
    });
  }
}
