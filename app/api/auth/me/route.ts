import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";

export async function GET() {
  const user = await getUser();
  return user ? NextResponse.json({ id: user.id, email: user.email, lang: user.lang }) : NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
