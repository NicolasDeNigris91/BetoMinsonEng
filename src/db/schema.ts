import { relations } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  timestamp,
  date,
  integer,
  boolean,
  index,
} from "drizzle-orm/pg-core";

export const categoriaEnum = pgEnum("categoria", [
  "ELE",
  "HID",
  "HVAC",
  "PISCINA",
  "ASP",
  "SIS",
]);

export const vistoriaStatusEnum = pgEnum("vistoria_status", [
  "rascunho",
  "finalizada",
]);

export const achadoStatusEnum = pgEnum("achado_status", [
  "aberto",
  "resolvido",
]);

export const eventoTipoEnum = pgEnum("evento_tipo", [
  "criado",
  "persiste",
  "resolvido",
  "nota",
]);

export const empreendimentos = pgTable("empreendimentos", {
  id: uuid("id").primaryKey().defaultRandom(),
  nome: varchar("nome", { length: 200 }).notNull(),
  cliente: varchar("cliente", { length: 200 }),
  endereco: text("endereco"),
  logoUrl: text("logo_url"),
  observacoes: text("observacoes"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const unidades = pgTable(
  "unidades",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    empreendimentoId: uuid("empreendimento_id")
      .notNull()
      .references(() => empreendimentos.id, { onDelete: "cascade" }),
    nome: varchar("nome", { length: 100 }).notNull(),
    observacoes: text("observacoes"),
    ordem: integer("ordem").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("unidades_empreendimento_idx").on(t.empreendimentoId)],
);

export const vistorias = pgTable(
  "vistorias",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    unidadeId: uuid("unidade_id")
      .notNull()
      .references(() => unidades.id, { onDelete: "cascade" }),
    data: date("data").notNull(),
    vistoriadorNome: varchar("vistoriador_nome", { length: 200 }),
    status: vistoriaStatusEnum("status").default("rascunho").notNull(),
    observacoesGerais: text("observacoes_gerais"),
    finalizadaEm: timestamp("finalizada_em", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("vistorias_unidade_idx").on(t.unidadeId),
    index("vistorias_data_idx").on(t.data),
  ],
);

export const achados = pgTable(
  "achados",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    unidadeId: uuid("unidade_id")
      .notNull()
      .references(() => unidades.id, { onDelete: "cascade" }),
    categoria: categoriaEnum("categoria").notNull(),
    local: varchar("local", { length: 300 }),
    descricao: text("descricao").notNull(),
    status: achadoStatusEnum("status").default("aberto").notNull(),
    vistoriaOrigemId: uuid("vistoria_origem_id")
      .notNull()
      .references(() => vistorias.id, { onDelete: "restrict" }),
    vistoriaResolvidoId: uuid("vistoria_resolvido_id").references(
      () => vistorias.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("achados_unidade_idx").on(t.unidadeId),
    index("achados_unidade_status_idx").on(t.unidadeId, t.status),
    index("achados_vistoria_origem_idx").on(t.vistoriaOrigemId),
  ],
);

export const achadoEventos = pgTable(
  "achado_eventos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    achadoId: uuid("achado_id")
      .notNull()
      .references(() => achados.id, { onDelete: "cascade" }),
    vistoriaId: uuid("vistoria_id")
      .notNull()
      .references(() => vistorias.id, { onDelete: "cascade" }),
    tipo: eventoTipoEnum("tipo").notNull(),
    notaExtra: text("nota_extra"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("achado_eventos_achado_idx").on(t.achadoId),
    index("achado_eventos_vistoria_idx").on(t.vistoriaId),
  ],
);

export const fotos = pgTable(
  "fotos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    achadoEventoId: uuid("achado_evento_id")
      .notNull()
      .references(() => achadoEventos.id, { onDelete: "cascade" }),
    arquivoPath: text("arquivo_path").notNull(),
    thumbPath: text("thumb_path").notNull(),
    legenda: text("legenda"),
    ordem: integer("ordem").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("fotos_evento_idx").on(t.achadoEventoId)],
);

export const shareTokens = pgTable(
  "share_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vistoriaId: uuid("vistoria_id")
      .notNull()
      .references(() => vistorias.id, { onDelete: "cascade" }),
    token: varchar("token", { length: 64 }).notNull().unique(),
    expiraEm: timestamp("expira_em", { withTimezone: true }).notNull(),
    permiteUpload: boolean("permite_upload").default(false).notNull(),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("share_tokens_vistoria_idx").on(t.vistoriaId)],
);

// Buckets de rate limit. Substitui o Map em memoria do processo —
// sobrevive a deploys/restarts e funciona em multi-replica. Cada (key)
// vira uma linha; UPSERT atomico decide reset/increment.
export const rateLimitBuckets = pgTable(
  "rate_limit_buckets",
  {
    key: varchar("key", { length: 200 }).primaryKey(),
    count: integer("count").notNull().default(1),
    resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("rate_limit_buckets_reset_idx").on(t.resetAt)],
);

// Preparacao para migrar do APP_PASSWORD compartilhado pra usuarios
// por pessoa. Tabela existe; auth ainda nao foi cabeada nela.
//
// Quando ativar:
// 1. Adicionar bcrypt/argon2 como dep
// 2. Trocar passwordMatches() em lib/auth.ts pra buscar por email + hash
// 3. Adicionar coluna criado_por_usuario_id em vistorias/achados/fotos
//    pra audit trail real (migration separada)
// 4. Criar usuario 'sistema' e backfill dados antigos
export const usuarios = pgTable(
  "usuarios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nome: varchar("nome", { length: 200 }).notNull(),
    email: varchar("email", { length: 200 }).notNull().unique(),
    senhaHash: varchar("senha_hash", { length: 255 }).notNull(),
    desativadoEm: timestamp("desativado_em", { withTimezone: true }),
    ultimoAcessoEm: timestamp("ultimo_acesso_em", { withTimezone: true }),
    criadoEm: timestamp("criado_em", { withTimezone: true })
      .defaultNow()
      .notNull(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("usuarios_email_idx").on(t.email)],
);

export const empreendimentosRelations = relations(empreendimentos, ({ many }) => ({
  unidades: many(unidades),
}));

export const unidadesRelations = relations(unidades, ({ one, many }) => ({
  empreendimento: one(empreendimentos, {
    fields: [unidades.empreendimentoId],
    references: [empreendimentos.id],
  }),
  vistorias: many(vistorias),
  achados: many(achados),
}));

export const vistoriasRelations = relations(vistorias, ({ one, many }) => ({
  unidade: one(unidades, {
    fields: [vistorias.unidadeId],
    references: [unidades.id],
  }),
  eventos: many(achadoEventos),
  shareTokens: many(shareTokens),
}));

export const achadosRelations = relations(achados, ({ one, many }) => ({
  unidade: one(unidades, {
    fields: [achados.unidadeId],
    references: [unidades.id],
  }),
  vistoriaOrigem: one(vistorias, {
    fields: [achados.vistoriaOrigemId],
    references: [vistorias.id],
    relationName: "achado_origem",
  }),
  vistoriaResolvido: one(vistorias, {
    fields: [achados.vistoriaResolvidoId],
    references: [vistorias.id],
    relationName: "achado_resolvido",
  }),
  eventos: many(achadoEventos),
}));

export const achadoEventosRelations = relations(
  achadoEventos,
  ({ one, many }) => ({
    achado: one(achados, {
      fields: [achadoEventos.achadoId],
      references: [achados.id],
    }),
    vistoria: one(vistorias, {
      fields: [achadoEventos.vistoriaId],
      references: [vistorias.id],
    }),
    fotos: many(fotos),
  }),
);

export const fotosRelations = relations(fotos, ({ one }) => ({
  evento: one(achadoEventos, {
    fields: [fotos.achadoEventoId],
    references: [achadoEventos.id],
  }),
}));

export const shareTokensRelations = relations(shareTokens, ({ one }) => ({
  vistoria: one(vistorias, {
    fields: [shareTokens.vistoriaId],
    references: [vistorias.id],
  }),
}));

export type Empreendimento = typeof empreendimentos.$inferSelect;
export type NovoEmpreendimento = typeof empreendimentos.$inferInsert;
export type Unidade = typeof unidades.$inferSelect;
export type NovaUnidade = typeof unidades.$inferInsert;
export type Vistoria = typeof vistorias.$inferSelect;
export type NovaVistoria = typeof vistorias.$inferInsert;
export type Achado = typeof achados.$inferSelect;
export type NovoAchado = typeof achados.$inferInsert;
export type AchadoEvento = typeof achadoEventos.$inferSelect;
export type NovoAchadoEvento = typeof achadoEventos.$inferInsert;
export type Foto = typeof fotos.$inferSelect;
export type NovaFoto = typeof fotos.$inferInsert;
export type ShareToken = typeof shareTokens.$inferSelect;

export type Categoria = (typeof categoriaEnum.enumValues)[number];
export type VistoriaStatus = (typeof vistoriaStatusEnum.enumValues)[number];
export type AchadoStatus = (typeof achadoStatusEnum.enumValues)[number];
export type EventoTipo = (typeof eventoTipoEnum.enumValues)[number];

export const CATEGORIA_LABELS: Record<Categoria, string> = {
  ELE: "Elétrica",
  HID: "Hidráulica",
  HVAC: "HVAC",
  PISCINA: "Piscina",
  ASP: "Aspiração",
  SIS: "Sistemas",
};
