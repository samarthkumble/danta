import "server-only";

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}. See .env.example.`);
  return v;
}

export const env = {
  get paypalClientId() {
    return need("PAYPAL_CLIENT_ID");
  },
  get paypalSecret() {
    return need("PAYPAL_CLIENT_SECRET");
  },
  get paypalBase() {
    return process.env.PAYPAL_API_BASE ?? "https://api-m.sandbox.paypal.com";
  },
  get paypalWebhookId() {
    return process.env.PAYPAL_WEBHOOK_ID ?? "";
  },
  get supabaseUrl() {
    return need("SUPABASE_URL");
  },
  get supabaseSecret() {
    return need("SUPABASE_SECRET_KEY");
  },
  get geminiKey() {
    return need("GEMINI_API_KEY");
  },
  get geminiModel() {
    return process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";
  },
  get appUrl() {
    return process.env.APP_URL ?? "http://localhost:3000";
  },
};
