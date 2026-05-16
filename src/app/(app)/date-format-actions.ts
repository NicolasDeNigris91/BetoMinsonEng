"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { DATE_FORMAT_COOKIE, type DateFormat } from "@/lib/format";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export async function setDateFormatAction(fmt: DateFormat): Promise<void> {
  const store = await cookies();
  store.set(DATE_FORMAT_COOKIE, fmt, {
    maxAge: ONE_YEAR_SECONDS,
    httpOnly: false,
    sameSite: "lax",
    path: "/",
  });
  // Forca re-render do layout pra cima (e descendentes) com o novo formato.
  revalidatePath("/", "layout");
}
