import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { env } from "@/lib/env.server";

function keyMaterial() {
  const secret = env("BETTER_AUTH_SECRET") ?? env("XAI_API_KEY");
  if (!secret) throw new Error("Secure credential storage isn't configured on this server.");
  return scryptSync(secret, "tenro-provider-keys", 32);
}

export function encryptSecret(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyMaterial(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptSecret(packed: string) {
  const [iv, tag, body] = packed.split(".");
  if (!iv || !tag || !body) throw new Error("Stored credential is unreadable.");
  const decipher = createDecipheriv("aes-256-gcm", keyMaterial(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  const plain = Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]);
  return plain.toString("utf8");
}

export function secretHint(plain: string) {
  const trimmed = plain.trim();
  return trimmed.length <= 4 ? "••••" : `••••${trimmed.slice(-4)}`;
}
