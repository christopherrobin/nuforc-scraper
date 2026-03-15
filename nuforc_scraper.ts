import fetch from "node-fetch";
import fs from "fs";
import { parse } from "node-html-parser";
import { setTimeout } from "timers/promises";
import { fileURLToPath } from "url";

// Type for a single sighting entry
export type Sighting = {
  id: string
  href: string
  occurredAt: string
  city: string | null
  state: string | null
  country: string | null
  shape: string | null
  summary: string | null
  reportedAt: string | null
  mediaIncluded: boolean
  explanation: string | null
}

// Type for a single row from the API (H2: labeled tuple)
export type SightingRow = [
  link: string | null,
  occurredAt: string | null,
  city: string | null,
  state: string | null,
  country: string | null,
  shape: string | null,
  summary: string | null,
  reportedAt: string | null,
  hasImage: string | null,
  explanation: string | null,
]

// Type for the API response
type NuforcApiResponse = {
  draw: number
  recordsTotal: number
  recordsFiltered: number
  data: SightingRow[]
}

const ENDPOINT =
  "https://nuforc.org/wp-admin/admin-ajax.php?action=get_wdtable&table_id=1&wdt_var1=Post&wdt_var2=-1"
const WDT_NONCE = process.env.WDT_NONCE ?? ""
// Delay between requests in milliseconds to avoid rate limiting
const parsedDelay = Number(process.env.REQUEST_DELAY)
const REQUEST_DELAY = Number.isFinite(parsedDelay) && parsedDelay > 0 ? parsedDelay : 1000
const parsedMaxRecords = Number(process.env.MAX_RECORDS)
const MAX_RECORDS = Number.isFinite(parsedMaxRecords) && parsedMaxRecords > 0 ? parsedMaxRecords : undefined

const PAGE_SIZE = 100
const OUTPUT_FILE = "nuforc-results.json"
const TMP_FILE = "nuforc-results.tmp.json"

// M2: Column names for generating form params
const COLUMN_NAMES = ["Link", "Occurred", "City", "State", "Country", "Shape", "Summary", "Reported", "HasImage", "Explanation"]

// H1: Extract common field mapping (fixes catch-block bug with hardcoded mediaIncluded: false)
function mapCommonFields(row: SightingRow): Omit<Sighting, 'id' | 'href'> {
  return {
    occurredAt: row[1] ?? "",
    city: row[2] ?? null,
    state: row[3] ?? null,
    country: row[4] ?? null,
    shape: row[5] ?? null,
    summary: row[6] ?? null,
    reportedAt: row[7] ?? null,
    mediaIncluded: row[8] === "Y",
    explanation: row[9] ?? null,
  }
}

export const parseSighting = (row: SightingRow): Sighting => {
  try {
    // Parse href and id from <a ... href="...">...</a>
    const root = parse(row[0] ?? "")
    const link = root.querySelector("a")

    if (!link) {
      console.warn("No link found in row:", row[0])
      return { id: "", href: "", ...mapCommonFields(row) }
    }

    const href = link.getAttribute("href") || ""
    const idMatch = href.match(/id=(\d+)/)
    const id = idMatch ? idMatch[1] : ""

    return { id, href, ...mapCommonFields(row) }
  } catch (error) {
    console.error("Error parsing sighting:", error)
    return { id: "", href: "", ...mapCommonFields(row) }
  }
}

async function fetchPage(start: number, draw: number): Promise<SightingRow[]> {
  // M2: Generate column definitions in a loop
  const params: Record<string, string> = {
    draw: draw.toString(),
    "order[0][column]": "1",
    "order[0][dir]": "desc",
    start: start.toString(),
    length: PAGE_SIZE.toString(),
    "search[value]": "",
    "search[regex]": "false",
    wdtNonce: WDT_NONCE,
  }

  COLUMN_NAMES.forEach((name, i) => {
    params[`columns[${i}][data]`] = String(i)
    params[`columns[${i}][name]`] = name
    params[`columns[${i}][searchable]`] = "true"
    params[`columns[${i}][orderable]`] = i === 0 ? "false" : "true"
    params[`columns[${i}][search][value]`] = ""
    params[`columns[${i}][search][regex]`] = "false"
  })

  const formBody = new URLSearchParams(params)

  const resp = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
      "x-requested-with": "XMLHttpRequest",
      "origin": "https://nuforc.org",
      "referer": "https://nuforc.org/subndx/?id=all",
      "user-agent": "NUFORC-Scraper/1.0 (research; +https://alienquery.com)",
      accept: "application/json, text/javascript, */*; q=0.01",
    },
    body: formBody.toString(),
  })

  if (!resp.ok) {
    const errorText = await resp.text()
    throw new Error(`Failed to fetch page: ${resp.status} ${resp.statusText}\n${errorText}`)
  }

  try {
    // M1: Runtime validation on resp.json()
    const json = await resp.json()
    if (!json || !Array.isArray((json as NuforcApiResponse).data)) {
      throw new Error(`Unexpected API response shape: ${JSON.stringify(json).slice(0, 200)}`)
    }
    return (json as NuforcApiResponse).data as SightingRow[]
  } catch (error) {
    console.error("Error parsing JSON response:", error)
    throw new Error(`Failed to parse JSON response: ${error}`)
  }
}

// M3: parseArgs throws instead of process.exit(1)
export function parseArgs(argv: string[]): { maxRecords?: number; force: boolean; pretty: boolean } {
  let maxRecords: number | undefined = undefined;
  let force = false;
  let pretty = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg.startsWith('--max-records=')) {
      const value = arg.split('=')[1];
      maxRecords = Number(value);
      if (!Number.isFinite(maxRecords) || maxRecords <= 0) {
        throw new Error('Invalid value for --max-records. Must be a positive number.');
      }
    } else if (arg === '--max-records' && i + 1 < argv.length) {
      maxRecords = Number(argv[i + 1]);
      if (!Number.isFinite(maxRecords) || maxRecords <= 0) {
        throw new Error('Invalid value for --max-records. Must be a positive number.');
      }
      i++;
    } else if (arg === '--force') {
      force = true;
    } else if (arg === '--pretty') {
      pretty = true;
    }
  }

  return { maxRecords, force, pretty };
}

export function shouldAbortWrite(newCount: number, existingCount: number, force: boolean): boolean {
  if (existingCount === 0) return false;
  const threshold = existingCount * 0.5;
  return newCount < threshold && !force;
}

// H3: Extracted scrape logic from main()
async function scrapeAll(options: { maxRecords?: number }): Promise<Sighting[]> {
  const { maxRecords } = options
  const allSightings: Sighting[] = []
  let draw = 1
  let start = 0
  let moreData = true
  let retryCount = 0
  const maxRetries = 3

  console.log("Starting NUFORC scraping...")
  console.log("WDT_NONCE: set")
  if (maxRecords) {
    console.log(`Will scrape a maximum of ${maxRecords} records (for testing)`)
  }

  while (moreData) {
    try {
      console.log(`Fetching page (start=${start})...`)
      const rows = await fetchPage(start, draw)

      if (rows.length === 0) {
        console.log("No more data found, finishing scrape")
        moreData = false
      } else {
        const sightings = rows.map(parseSighting).filter(s => s.id !== "")
        console.log(`Retrieved ${sightings.length} valid sightings from this page`)

        // Add sightings up to the max limit
        if (maxRecords) {
          const remainingSlots = maxRecords - allSightings.length;
          if (remainingSlots <= 0) {
            console.log(`Already reached maximum of ${maxRecords} records, stopping scrape`)
            moreData = false;
          } else if (remainingSlots < sightings.length) {
            console.log(`Adding ${remainingSlots} more records to reach limit of ${maxRecords}`)
            allSightings.push(...sightings.slice(0, remainingSlots))
            console.log(`Reached maximum of ${maxRecords} records, stopping scrape`)
            moreData = false;
          } else {
            allSightings.push(...sightings)
            console.log(`Now have ${allSightings.length}/${maxRecords} records`)
            if (allSightings.length === maxRecords) {
              console.log(`Exactly reached maximum of ${maxRecords} records, stopping scrape`)
              moreData = false;
            }
          }
        } else {
          allSightings.push(...sightings)
        }

        if (moreData) {
          start += PAGE_SIZE
          draw += 1
          retryCount = 0
        }

        if (moreData) {
          console.log(`Waiting ${REQUEST_DELAY}ms before next request...`)
          await setTimeout(REQUEST_DELAY)
        }
      }
    } catch (error) {
      console.error(`Error fetching page (start=${start}):`, error)
      retryCount++

      if (retryCount >= maxRetries) {
        console.error(`Failed after ${maxRetries} retries, stopping scrape`)
        moreData = false
      } else {
        const backoffDelay = REQUEST_DELAY * Math.pow(2, retryCount)
        console.log(`Retry ${retryCount}/${maxRetries} after waiting ${backoffDelay}ms...`)
        await setTimeout(backoffDelay)
      }
    }
  }

  return allSightings
}

// H3: Extracted write logic from main()
function writeResultsSafely(sightings: Sighting[], options: { pretty: boolean; force: boolean; maxRecords?: number }): void {
  const { pretty, force, maxRecords } = options

  console.log(`Scraped ${sightings.length} sightings. Writing to ${OUTPUT_FILE}...`)

  const jsonContent = pretty ? JSON.stringify(sightings, null, 2) : JSON.stringify(sightings)

  try {
    fs.writeFileSync(TMP_FILE, jsonContent)

    if (!maxRecords && fs.existsSync(OUTPUT_FILE)) {
      try {
        // M4: Array.isArray guard on existing file parse
        const parsed = JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf-8"))
        if (Array.isArray(parsed) && shouldAbortWrite(sightings.length, parsed.length, force)) {
          fs.unlinkSync(TMP_FILE)
          console.error(`ABORTED: New scrape has ${sightings.length} records but existing file has ${parsed.length}. This looks like a failed scrape. Use --force to overwrite anyway.`)
          process.exit(1)
        }
      } catch {
        // If we can't parse the existing file, proceed with overwrite
      }
    }

    fs.renameSync(TMP_FILE, OUTPUT_FILE)
    console.log(`Successfully wrote data to ${OUTPUT_FILE}`)
  } catch (error) {
    console.error("Error writing to file:", error)
    const backupFilename = `nuforc-results-backup-${Date.now()}.json`
    console.log(`Attempting to write to backup file: ${backupFilename}`)
    try {
      fs.writeFileSync(backupFilename, jsonContent)
      console.log(`Successfully wrote data to backup file: ${backupFilename}`)
    } catch (backupError) {
      console.error("Backup write also failed:", backupError)
      console.error(`${sightings.length} records were scraped but could not be saved.`)
    }
  }
}

async function main() {
  if (!WDT_NONCE) {
    console.error("ERROR: WDT_NONCE environment variable is required. Visit nuforc.org/subndx/?id=all and inspect the page source for wdtNonceFrontendServerSide to obtain it.")
    process.exit(1)
  }

  // M3: Wrap parseArgs in try/catch since it now throws
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs(process.argv);
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
    return; // unreachable, but helps TS narrow `parsed`
  }

  const maxRecords = parsed.maxRecords ?? MAX_RECORDS;
  const force = parsed.force;
  const pretty = parsed.pretty;

  const allSightings = await scrapeAll({ maxRecords })

  writeResultsSafely(allSightings, { pretty, force, maxRecords })

  console.log("Done!")
}

const __filename = fileURLToPath(import.meta.url)
const isDirectRun = process.argv[1] === __filename
if (isDirectRun) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
