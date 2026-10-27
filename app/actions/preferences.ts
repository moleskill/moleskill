"use server";

import { getUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function saveLanguagePreference(lang: "ru" | "en") {
  const user = await getUser();
  if (!user) return;
  await prisma.user.update({ where: { id: user.id }, data: { lang } });
}
