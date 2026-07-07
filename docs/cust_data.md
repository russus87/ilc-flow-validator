# Come viene creato il `cust_data.xml`

Manuale di riferimento sul file `cust_data.xml` del flusso **Unicredit ILCM01**: a cosa serve,
chi lo genera, com'è strutturato e da dove arriva ogni valore.

> La sorgente di verità è l'estensione **`Unicredit.Extensions.StagingAreaProcessing`**
> (metodo `WriteDataSetXML` + `BuildBuste`). L'anteprima nel validator (`buildCustDataXml`
> in `engine.js`) riproduce la stessa logica a scopo di verifica, leggendo direttamente il
> file di input invece che dalla staging area.

---

## 1. A cosa serve

Il `cust_data.xml` accompagna il lotto e descrive, **per ogni busta**, il **recapitista**
(vettore postale) e l'eventuale **indirizzo di restituzione** (cartolina di ritorno /
raccomandata). È un file **anagrafico di busta**, non di documento: una `<BUSTA>` per busta
fisica, indipendentemente da quanti documenti contiene.

## 2. Chi lo genera e quando

Viene prodotto dall'estensione **`StagingAreaProcessing`** durante la prima parte della
lavorazione, nel metodo `WriteDataSetXML()`. L'estensione:

1. legge la **header staging area** (dati di intestazione del lotto) per ricavare il recapitista;
2. legge la **documents staging area** (un oggetto per documento) per costruire le buste;
3. serializza tutto in XML e lo salva come `dataset.xml` (il nostro `cust_data.xml`).

## 3. Struttura del file

```xml
<DATASET>
  <GLOBAL RECAPITISTA="PTT" />
  <BUSTA ID="UJZT1Q72KX500001UJS0">
    <ADDCART1>UNICREDIT SPA</ADDCART1>
    <ADDCART2>C/O ISOLA DIGITALE CMP BARI</ADDCART2>
    <ADDCART3>VIALE FRANCESCO DE BLASIO SNC</ADDCART3>
    <ADDCART4>70132 BARI BA</ADDCART4>
    <ADDCART5 />
  </BUSTA>
  <!-- una <BUSTA> per busta del lotto -->
</DATASET>
```

- **`<DATASET>`** — elemento radice.
- **`<GLOBAL RECAPITISTA="…">`** — il recapitista, valido per l'intero lotto. Sempre uno solo,
  **prima** delle buste.
- **`<BUSTA ID="…">`** — una per busta; `ID` = codice univoco della busta.
- **`<ADDCART1..5>`** — le 5 righe dell'indirizzo di restituzione (spesso vuote: valorizzate
  solo per le raccomandate con cartolina di ritorno).

## 4. Da dove arriva ogni valore

| Elemento XML | Sorgente nel tracciato | Campo | Opzione configurabile |
|---|---|---|---|
| `GLOBAL/@RECAPITISTA` | record **NOPL** (`000000011000`), header staging area | `TemplateNoplFormat.codrecap` | `DelivererFieldPath` |
| `BUSTA/@ID` | record **NOP0** (`000000021000`), una per busta | `EnvelopeNop0Format.coduni` | `BustaIdFieldPath` |
| `BUSTA/ADDCART1..5` | record **NOP0** (`000000021000`) | `EnvelopeNop0Format.addcart1` … `addcart5` | `AddcartFieldPathPrefix` |

> I nomi dei path (`EnvelopeNop0Format.coduni`, ecc.) sono quelli degli oggetti JSON in staging
> area, prodotti a monte dal parsing del tracciato a larghezza fissa.

## 5. Regole di costruzione

- **Una `<BUSTA>` per `coduni`** — le buste sono deduplicate sul codice univoco: se più
  documenti condividono lo stesso `coduni`, viene emessa **una sola** busta (i successivi
  vengono ignorati). Prevale il **primo** documento incontrato per quel `coduni`.
- **Trim** — `coduni` e `addcart*` vengono ripuliti dagli spazi iniziali/finali.
  ⚠️ Lo spazio **interno** resta (es. un ente a 2 caratteri come `C0␣` produce
  `ID="C0 T3Q6AKJA…"`).
- **Item senza ID scartato** — un documento con `coduni` vuoto non genera busta.
- **Recapitista mancante** — se `codrecap` è vuoto:
  - con `StopOnDelivererNotFound = true` (default) l'estensione **si ferma con errore** e il
    file **non** viene generato;
  - con `StopOnDelivererNotFound = false` esce `RECAPITISTA=""`.
- **Indentazione** — l'XML viene riformattato indentato (un livello per `BUSTA`, uno per
  `ADDCART`). La dichiarazione `<?xml …?>` è **omessa** nel file di produzione.

## 6. Opzioni (`ElaborationOptions`)

Tutti i path sono configurabili sull'estensione, quindi la sorgente di ogni valore può essere
ri-mappata senza toccare il codice:

| Opzione | Default | Cosa controlla |
|---|---|---|
| `DelivererFieldPath` | `TemplateNoplFormat.codrecap` | da dove si legge il RECAPITISTA |
| `BustaIdFieldPath` | `EnvelopeNop0Format.coduni` | da dove si legge l'ID busta |
| `AddcartFieldPathPrefix` | `EnvelopeNop0Format.addcart` | prefisso di `addcart1..5` |
| `StopOnDelivererNotFound` | `true` | se bloccare quando il recapitista manca |

## 7. Note ed edge case

- **`RECAPITISTA` è copiato verbatim**: non c'è alcuna tabella di conversione codice→vettore.
  Se il file di input contiene `000`, in uscita c'è `RECAPITISTA="000"`. Il valore corretto
  (es. `PTT`) deve arrivare già nel campo `codrecap` a monte.
- **`ADDCART` vuoti** sono normali per la posta ordinaria; l'indirizzo del **destinatario**
  vive altrove (righe `destriga*` del NOP0 / dati del documento), non negli `addcart`.
- **`ID` con spazio interno**: se il consumatore a valle non tollera spazi nell'ID, va
  normalizzato il `coduni` a monte.

## 8. L'anteprima nel validator

Nel tab **📮 cust_data.xml** l'app costruisce lo stesso file leggendo i record del lotto:
`RECAPITISTA` da `TemplateNoplFormat.codrecap`, una `<BUSTA>` per `EnvelopeNop0Format.coduni`
(deduplicata), `ADDCART1..5` dai rispettivi campi del NOP0. È un'anteprima **a scopo di
verifica**: la logica è identica alla produzione, ma i dati sono letti dal file di input.
