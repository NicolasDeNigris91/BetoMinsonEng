import "server-only";
import { unstable_cache } from "next/cache";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { mensagens } from "@/db/schema";
import { CACHE_TAGS } from "@/lib/cache-tags";

async function fetchMensagensNaoLidasUncached(): Promise<number> {
  const [row] = await db
    .select({
      n: sql<number>`count(*) filter (where ${mensagens.autor} = 'funcionario' and ${mensagens.lidoEm} is null)::int`,
    })
    .from(mensagens);
  return Number(row?.n ?? 0);
}

export const fetchMensagensNaoLidas = unstable_cache(
  fetchMensagensNaoLidasUncached,
  ["mensagens-nao-lidas-total"],
  {
    tags: [CACHE_TAGS.mensagens],
    revalidate: 60,
  },
);
