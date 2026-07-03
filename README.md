# ILC Flow Validator

App desktop (Tauri) per **validare un file del flusso Unicredit ILCM01** prima della
lavorazione e vedere in anteprima come verrà tradotto nei file di uscita **`.bol`**,
**`cust_data.xml`** e **`.dat`**.

Funziona **offline**: nessun dato lascia il computer.

![finestra dell'app](assets/icon.svg)

## Cosa controlla

- File leggibile, con record di inizio e fine
- Buste complete (aperte e chiuse)
- Tutti i tipi di record riconosciuti dal tracciato ILCM01
- **Un solo flusso**: segnala se il file mescola ILCM01 con altri flussi (es. `ILCCDR`),
  che condividono gli stessi codici record ma hanno contenuto diverso
- **Template di stampa** presente su ogni documento (senza template il PDF non si genera)
- Righe più lunghe del tracciato (dati che verrebbero ignorati)

## Anteprima output

- **`.bol`** — intestazione + una riga per documento
- **`cust_data.xml`** — un blocco `<Document>` per documento, con i nomi reali dei campi
  del tracciato (come li produce l'estensione `StagingAreaToXML` via JSON→XML)
- **`.dat`** — intestazione + dati per documento

I valori marcati «calcolato in stampa» (numero pagine/fogli, nome PDF) sono determinati
solo durante la generazione dei PDF e non compaiono nell'anteprima.

## Sviluppo

Richiede Rust, Node e `webkit2gtk-4.1` (su Arch: `pacman -S webkit2gtk-4.1 gtk3`).

```bash
npm install
npm run dev      # finestra di sviluppo
npm run build    # build locale
```

## Build & release

Il workflow `.github/workflows/build.yml` produce, al push di un tag `v*`:

- **Arch Linux**: `ilc-flow-validator-<ver>-1-x86_64.pkg.tar.zst`
- **macOS**: `.dmg` + `.app.tar.gz` (Apple Silicon + Intel)

```bash
git tag v0.1.0 && git push origin v0.1.0
```

## Come è fatto il modello

`src/model.js` è **generato dal codice dei progetti Nest/Raven**: il tracciato proviene da
`StreamILCM01` e le mappature di output da `UIT03001_ILCM01`. Se il tracciato o le mappature
cambiano, `model.js` va rigenerato per restare allineato.

## Struttura

| Percorso | Contenuto |
|----------|-----------|
| `src/` | frontend dell'app (`index.html`, `engine.js`, `model.js`) |
| `src-tauri/` | app Tauri (Rust) |
| `packaging/` | `PKGBUILD` e `.desktop` per Arch |
| `assets/icon.svg` | icona sorgente |

## Nota di riservatezza

`model.js` contiene il tracciato documentale interno del flusso Unicredit ILC.
Tenere il repository **privato**.

## Licenza

MIT
