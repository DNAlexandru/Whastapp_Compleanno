import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function caricaConfig() {
  return JSON.parse(fs.readFileSync(path.join(root, "config.json"), "utf8"));
}

export function caricaFamiglia() {
  const { persone } = JSON.parse(fs.readFileSync(path.join(root, "data", "famiglia.json"), "utf8"));
  const perId = new Map(persone.map((p) => [p.id, p]));
  for (const p of persone) {
    for (const ref of [...p.genitori, p.coniuge].filter(Boolean)) {
      if (!perId.has(ref)) throw new Error(`famiglia.json: ${p.id} fa riferimento a id inesistente "${ref}"`);
    }
  }
  return { persone, perId };
}

/** Data di oggi {anno, mese, giorno} nel fuso orario indicato. */
export function oggiNelFuso(fusoOrario, data = new Date()) {
  const parti = new Intl.DateTimeFormat("en-CA", {
    timeZone: fusoOrario, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(data);
  const v = (t) => Number(parti.find((x) => x.type === t).value);
  return { anno: v("year"), mese: v("month"), giorno: v("day") };
}

export const chiaveData = ({ anno, mese, giorno }) =>
  `${anno}-${String(mese).padStart(2, "0")}-${String(giorno).padStart(2, "0")}`;

const bisestile = (a) => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;

/** Giorno in cui si festeggia nell'anno dato (29/2 -> 1/3 negli anni non bisestili). */
export function giornoFesta(p, anno) {
  if (p.mese === 2 && p.giorno === 29 && !bisestile(anno)) return { mese: 3, giorno: 1 };
  return { mese: p.mese, giorno: p.giorno };
}

export function compleanniDel(famiglia, data, { includiDefunti = false } = {}) {
  return famiglia.persone.filter((p) => {
    if (p.attivo === false) return false;
    if (p.defunto && !includiDefunti) return false;
    const f = giornoFesta(p, data.anno);
    return f.mese === data.mese && f.giorno === data.giorno;
  });
}

export const eta = (p, anno) => (p.anno ? anno - p.anno : null);

/** Contesto familiare in italiano, da passare al modello. */
export function contesto(p, famiglia, data, config) {
  const { persone, perId } = famiglia;
  const nome = (id) => perId.get(id)?.nome;
  const figliDi = (id) => persone.filter((x) => x.genitori.includes(id));
  const nomi = (lista) => lista.map((x) => x.nome).join(", ");

  const anni = eta(p, data.anno);
  const righe = [`Nome: ${p.nome} (${p.sesso === "F" ? "donna" : "uomo"})`];

  if (p.defunto) {
    righe.push("È SCOMPARSA/O: non è un augurio ma un ricordo affettuoso nel giorno in cui sarebbe stato il suo compleanno.");
  } else if (anni === null) {
    righe.push("Età: sconosciuta. NON menzionare l'età.");
  } else if (p.citaEta === true && anni >= config.sogliaEtaMenzionata) {
    righe.push(`Compie ${anni} anni: un traguardo bellissimo. Celebralo con orgoglio, gratitudine e rispetto, come una benedizione per tutta la famiglia.`);
  } else if (p.citaEta === false || anni >= config.sogliaEtaMenzionata) {
    righe.push("Età: NON menzionare l'età né il numero di anni, né allusioni agli anni che passano.");
  } else {
    righe.push(`Compie ${anni} anni.${anni < 13 ? " È un bambino/a: messaggio tenero e giocoso." : anni < 20 ? " È un adolescente." : ""}`);
  }

  if (p.coniuge) {
    const rel = p.relazioneConiuge ?? (p.sesso === "F" ? "moglie" : "marito");
    righe.push(`${rel === "fidanzata" ? "Fidanzato/a con" : rel === "moglie" ? "Moglie di" : "Marito di"}: ${nome(p.coniuge)}${perId.get(p.coniuge).defunto ? " (scomparsa/o)" : ""}`);
  }
  if (p.genitori.length) righe.push(`Figlio/a di: ${p.genitori.map(nome).join(" e ")}`);

  const fratelli = persone.filter((x) => x.id !== p.id && x.genitori.some((g) => p.genitori.includes(g)));
  if (fratelli.length) righe.push(`Fratelli/sorelle: ${nomi(fratelli)}`);

  const figli = figliDi(p.id);
  if (figli.length) righe.push(`Figli: ${nomi(figli)}`);
  const nipoti = figli.flatMap((f) => figliDi(f.id));
  if (nipoti.length) righe.push(`Nipoti (figli dei figli): ${nipoti.length} — ${nomi(nipoti)}`);
  const pronipoti = nipoti.flatMap((n) => figliDi(n.id));
  if (pronipoti.length) righe.push(`Pronipoti: ${pronipoti.length}`);

  if (p.note) righe.push(`Note: ${p.note}`);
  return righe.join("\n");
}
