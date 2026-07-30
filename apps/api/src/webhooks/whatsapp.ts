import { createHmac, timingSafeEqual } from "node:crypto";
import { Router } from "express";

// Mounted with `express.raw({ type: "application/json" })` for the POST route —
// Meta signs the exact raw body with the app secret (X-Hub-Signature-256).
export const whatsappWebhookRouter = Router();

// Meta calls this once with a challenge query param during webhook setup.
whatsappWebhookRouter.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

function isValidSignature(rawBody: Buffer, signatureHeader: string, appSecret: string) {
  const [, signature] = signatureHeader.split("sha256=");
  if (!signature) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  const signatureBuf = Buffer.from(signature, "utf8");
  return (
    expectedBuf.length === signatureBuf.length &&
    timingSafeEqual(expectedBuf, signatureBuf)
  );
}

whatsappWebhookRouter.post("/", (req, res) => {
  const signature = req.headers["x-hub-signature-256"];
  const appSecret = process.env.WHATSAPP_APP_SECRET ?? "";
  if (
    !signature ||
    typeof signature !== "string" ||
    !isValidSignature(req.body, signature, appSecret)
  ) {
    return res.sendStatus(403);
  }

  const event = JSON.parse(req.body.toString("utf8"));
  // TODO (Wave 3): route delivery/read receipts and inbound parent replies to
  // the relevant Invoice/AttendanceRecord/parent-notification flow.
  void event;

  res.sendStatus(200);
});
