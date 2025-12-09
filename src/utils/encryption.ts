import crypto from "crypto";

const SECRET_KEY = crypto
  .createHash("sha256")
  .update(String(process.env.SECRET_KEY || "my-strong-secret"))
  .digest("base64")
  .substring(0, 32); // AES-256 requires 32 bytes key

const IV = crypto.randomBytes(16); // 16 bytes for AES

//@ts-ignore
export function encrypt(text) {
    if (!text) return null;

    const cipher = crypto.createCipheriv("aes-256-cbc", SECRET_KEY, IV);
    let encrypted = cipher.update(text.toString(), "utf8", "base64");
    encrypted += cipher.final("base64");

    return `${IV.toString("base64")}:${encrypted}`;
}
//@ts-ignore
export function decrypt(encryptedText) {
    if (!encryptedText) return null;

    const [ivBase64, encrypted] = encryptedText.split(":");

    const decipher = crypto.createDecipheriv(
        "aes-256-cbc",
        SECRET_KEY,
        Buffer.from(ivBase64, "base64")
    );

    let decrypted = decipher.update(encrypted, "base64", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
}
