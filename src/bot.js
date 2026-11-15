import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pkg from "whatsapp-web.js";
import qrcode from "qrcode-terminal";
import { caricaConfig, caricaFamiglia, oggiNelFuso, chiaveData, compleanniDel } from "./famiglia.js";
import { generaMessaggio } from "./messaggio.js";

const { Client, LocalAuth } = pkg;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fileStato = path.join(root, "data", "stato.json");
const soloGruppi = process.argv.includes("--gruppi");

const config = caricaConfig();
const leggiStato = () => (fs.existsSync(fileStato) ? JSON.parse(fs.readFileSync(fileStato, "utf8")) : {});
const scriviStato = (s) => fs.writeFileSync(fileStato, JSON.stringify(s, null, 2));
const log = (...a) => console.log(new Date().toISOString(), ...a);

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: path.join(root, ".wwebjs_auth") }),
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--disable-gpu",
    ],
  },
  webVersionCache: {
    type: "remote",
    remotePath: "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/{version}.html",
    strict: false,
  },
  authTimeoutMs: 90000,
});

let gruppoId = null;
const approvatoreId = `${config.approvatore}@c.us`;

client.on("qr", (qr) => {
  log("Scansiona il QR con WhatsApp del numero del bot (Impostazioni → Dispositivi collegati → Collega un dispositivo):");
  qrcode.generate(qr, { small: true });
});
client.on("auth_failure", (m) => log("Autenticazione fallita:", m));
client.on("disconnected", (r) => { log("Disconnesso:", r); process.exit(1); }); // launchd lo riavvia

client.on("ready", async () => {
  const gruppi = (await client.getChats()).filter((c) => c.isGroup);
  if (soloGruppi) {
    log("Gruppi visibili da questo numero:\n" + gruppi.map((g) => `  - "${g.name}"`).join("\n"));
    process.exit(0);
  }
  const g = gruppi.find((c) => c.name === config.gruppo);
  if (!g) {
    log(`Gruppo "${config.gruppo}" non trovato. Il numero del bot deve essere membro del gruppo. Gruppi visibili: ${gruppi.map((x) => `"${x.name}"`).join(", ") || "nessuno"}`);
    process.exit(1);
  }
  gruppoId = g.id._serialized;
  log(`Pronto. Gruppo: "${g.name}". Modalità: ${config.modalita}. Invio alle ${config.ora} (${config.fusoOrario}).`);
  await tick();
  setInterval(tick, 60_000);
});

// ---------- invio ----------

async function inviaAlGruppo(p, testo) {
  const opzioni = {};
  if (p.telefono) {
    testo = `@${p.telefono} ${testo}`;
    opzioni.mentions = [`${p.telefono}@c.us`];
  }
  await client.sendMessage(gruppoId, testo, opzioni);
  log(`Inviato nel gruppo: ${p.id}`);
}

const avvisa = (testo) => client.sendMessage(approvatoreId, testo).catch((e) => log("Impossibile scrivere all'approvatore:", e.message));

function anteprima(n, p, voce, totale) {
  const rif = totale > 1 ? ` ${n}` : "";
  const avviso = voce.fonte === "riserva" ? "⚠️ Gemini non disponibile (chiave o quota?): questo è il testo di riserva.\n\n" : "";
  return `🎂 *Compleanno di oggi: ${p.nome}* (${p.id})\n\n${avviso}${voce.testo}\n\n` +
    `Rispondi:\n• *ok${rif}* → invia nel gruppo\n• *rigenera${rif}* [indicazione] → nuova versione\n` +
    `• *testo${rif}:* <tuo testo> → invia il tuo testo\n• *salta${rif}* → non inviare\n` +
    `Senza risposta entro le ${config.scadenzaApprovazione}: ${config.seNessunaRisposta === "invia" ? "invio automatico" : "non invio"}.`;
}

// ---------- ciclo giornaliero ----------

const oraCorrente = () =>
  new Intl.DateTimeFormat("en-GB", { timeZone: config.fusoOrario, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());

let occupato = false;
async function tick() {
  if (occupato || !gruppoId) return;
  occupato = true;
  try {
    const oggi = oggiNelFuso(config.fusoOrario);
    const chiave = chiaveData(oggi);
    const stato = leggiStato();
    const ora = oraCorrente();

    if (ora >= config.ora && !stato[chiave]?.elaborato) {
      const famiglia = caricaFamiglia();
      const festeggiati = compleanniDel(famiglia, oggi, { includiDefunti: config.ricordaDefunti });
      stato[chiave] ??= { voci: {} };
      log(`Compleanni di ${chiave}: ${festeggiati.map((p) => p.id).join(", ") || "nessuno"}`);

      for (const p of festeggiati) {
        if (stato[chiave].voci[p.id]) continue; // già gestito prima di un riavvio
        const { testo, fonte } = await generaMessaggio(p, famiglia, oggi, config, { altriOggi: festeggiati.filter((x) => x !== p) });
        const voce = { testo, fonte, stato: "in_attesa" };
        stato[chiave].voci[p.id] = voce;
        // Il proprio compleanno non passa dall'approvazione (sarebbe una sorpresa rovinata); i defunti sì, sempre.
        const diretto = !p.defunto && (config.modalita === "diretto" || p.io);
        if (diretto) {
          await inviaAlGruppo(p, testo);
          voce.stato = "inviato";
        }
        scriviStato(stato);
      }
      await mandaAnteprime(stato[chiave], famiglia);
      stato[chiave].elaborato = true;
      scriviStato(stato);
    }

    // Scadenza approvazione
    const giorno = stato[chiave];
    if (giorno && ora >= config.scadenzaApprovazione) {
      const famiglia = caricaFamiglia();
      for (const [id, voce] of Object.entries(giorno.voci)) {
        if (voce.stato !== "in_attesa") continue;
        const p = famiglia.perId.get(id);
        if (config.seNessunaRisposta === "invia" && !p.defunto) {
          await inviaAlGruppo(p, voce.testo);
          voce.stato = "inviato";
          await avvisa(`⏰ Nessuna risposta: inviato automaticamente il messaggio per ${p.nome}.`);
        } else {
          voce.stato = "saltato";
          await avvisa(`⏰ Nessuna risposta: messaggio per ${p.nome} non inviato.`);
        }
        scriviStato(stato);
      }
    }
  } catch (e) {
    log("Errore nel ciclo:", e);
  } finally {
    occupato = false;
  }
}

async function mandaAnteprime(giorno, famiglia) {
  const inAttesa = Object.entries(giorno.voci).filter(([, v]) => v.stato === "in_attesa");
  for (const [i, [id, voce]] of inAttesa.entries()) {
    voce.n = i + 1;
    await avvisa(anteprima(i + 1, famiglia.perId.get(id), voce, inAttesa.length));
  }
}

// ---------- risposte dell'approvatore ----------

async function daApprovatore(msg) {
  const norm = (s) => (s || "").replace(/:\d+@/, "@").replace(/[^0-9]/g, "");
  const target = norm(config.approvatore);
  if (!target) return false;

  if (norm(msg.from).includes(target)) return true;
  if (norm(msg.author).includes(target)) return true;

  try {
    const contact = await msg.getContact();
    if (norm(contact?.id?.user).includes(target) || norm(contact?.number).includes(target)) return true;
  } catch {}

  try {
    const chat = await msg.getChat();
    if (norm(chat?.id?.user).includes(target) || norm(chat?.id?._serialized).includes(target)) return true;
  } catch {}

  return false;
}

client.on("message", async (msg) => {
  log(`[messaggio ricevuto] da: ${msg.from}, autore: ${msg.author || "n/a"}, testo: "${msg.body}"`);
  if (!gruppoId || msg.from.endsWith("@g.us")) return;

  const autorizzato = await daApprovatore(msg);
  log(`[verifica approvatore] da: ${msg.from} -> autorizzato? ${autorizzato}`);
  if (!autorizzato) return;
  const testo = msg.body.trim();
  const m = testo.match(/^(ok|salta|rigenera|testo|prova|stato)\b\s*(\d+)?\s*:?\s*([\s\S]*)$/i);
  if (!m) return;
  const [, comando, numero, resto] = m;
  const cmd = comando.toLowerCase();

  while (occupato) await new Promise((r) => setTimeout(r, 500));
  occupato = true;
  try {
    const famiglia = caricaFamiglia();
    const oggi = oggiNelFuso(config.fusoOrario);
    const chiave = chiaveData(oggi);
    const stato = leggiStato();
    const giorno = stato[chiave];

    if (cmd === "prova") {
      // "prova dani_19" → anteprima di prova per chiunque, non inviata nel gruppo
      const p = famiglia.perId.get(resto.trim());
      if (!p) return void avvisa(`Id sconosciuto. Esempi: ${famiglia.persone.slice(0, 5).map((x) => x.id).join(", ")}…`);
      const { testo: t, fonte } = await generaMessaggio(p, famiglia, oggi, config);
      return void avvisa(`🧪 Prova per ${p.nome} (${fonte}, non inviato):\n\n${t}`);
    }
    if (cmd === "stato") {
      const righe = Object.entries(giorno?.voci ?? {}).map(([id, v]) => `• ${id}: ${v.stato}`);
      return void avvisa(`📋 ${chiave}\n${righe.join("\n") || "Nessun compleanno oggi."}`);
    }

    const inAttesa = Object.entries(giorno?.voci ?? {}).filter(([, v]) => v.stato === "in_attesa");
    if (!inAttesa.length) return void avvisa("Nessun messaggio in attesa di approvazione.");
    let scelta;
    if (numero) scelta = inAttesa.find(([, v]) => v.n === Number(numero));
    else if (inAttesa.length === 1) scelta = inAttesa[0];
    if (!scelta) return void avvisa(`Ci sono ${inAttesa.length} messaggi in attesa: indica il numero, es. "ok 1".`);

    const [id, voce] = scelta;
    const p = famiglia.perId.get(id);
    if (cmd === "ok") {
      await inviaAlGruppo(p, voce.testo);
      voce.stato = "inviato";
      await avvisa(`✅ Inviato per ${p.nome}.`);
    } else if (cmd === "salta") {
      voce.stato = "saltato";
      await avvisa(`⏭️ Saltato ${p.nome}.`);
    } else if (cmd === "testo") {
      if (!resto.trim()) return void avvisa('Scrivi il testo dopo i due punti, es. "testo: La mulți ani!"');
      voce.testo = resto.trim();
      voce.fonte = "manuale";
      await inviaAlGruppo(p, voce.testo);
      voce.stato = "inviato";
      await avvisa(`✅ Inviato il tuo testo per ${p.nome}.`);
    } else if (cmd === "rigenera") {
      const nuovo = await generaMessaggio(p, famiglia, oggi, config, { richiestaExtra: resto.trim() });
      Object.assign(voce, nuovo);
      await avvisa(anteprima(voce.n, p, voce, inAttesa.length));
    }
    scriviStato(stato);
  } catch (e) {
    log("Errore comando:", e);
    await avvisa(`⚠️ Errore: ${e.message}`);
  } finally {
    occupato = false;
  }
});

client.initialize();
