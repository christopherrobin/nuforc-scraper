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

// Type for the API response
type NuforcApiResponse = {
  draw: number
  recordsTotal: number
  recordsFiltered: number
  data: any[][]
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

export const parseSighting = (row: any[]): Sighting => {
  try {
    // Parse href and id from <a ... href="...">...</a>
    const root = parse(row[0] ?? "")
    const link = root.querySelector("a")

    if (!link) {
      console.warn("No link found in row:", row[0])
      return {
        id: "",
        href: "",
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

    const href = link.getAttribute("href") || ""
    const idMatch = href.match(/id=(\d+)/)
    const id = idMatch ? idMatch[1] : ""

    return {
      id,
      href,
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
  } catch (error) {
    console.error("Error parsing sighting:", error)
    // Return a default object with empty/null values
    return {
      id: "",
      href: "",
      occurredAt: row[1] ?? "",
      city: row[2] ?? null,
      state: row[3] ?? null,
      country: row[4] ?? null,
      shape: row[5] ?? null,
      summary: row[6] ?? null,
      reportedAt: row[7] ?? null,
      mediaIncluded: false,
      explanation: row[9] ?? null,
    }
  }
}

async function fetchPage(start: number, draw: number): Promise<any[][]> {
  const formBody = new URLSearchParams({
    draw: draw.toString(),
    "columns[0][data]": "0",
    "columns[0][name]": "Link",
    "columns[0][searchable]": "true",
    "columns[0][orderable]": "false",
    "columns[0][search][value]": "",
    "columns[0][search][regex]": "false",
    "columns[1][data]": "1",
    "columns[1][name]": "Occurred",
    "columns[1][searchable]": "true",
    "columns[1][orderable]": "true",
    "columns[1][search][value]": "",
    "columns[1][search][regex]": "false",
    "columns[2][data]": "2",
    "columns[2][name]": "City",
    "columns[2][searchable]": "true",
    "columns[2][orderable]": "true",
    "columns[2][search][value]": "",
    "columns[2][search][regex]": "false",
    "columns[3][data]": "3",
    "columns[3][name]": "State",
    "columns[3][searchable]": "true",
    "columns[3][orderable]": "true",
    "columns[3][search][value]": "",
    "columns[3][search][regex]": "false",
    "columns[4][data]": "4",
    "columns[4][name]": "Country",
    "columns[4][searchable]": "true",
    "columns[4][orderable]": "true",
    "columns[4][search][value]": "",
    "columns[4][search][regex]": "false",
    "columns[5][data]": "5",
    "columns[5][name]": "Shape",
    "columns[5][searchable]": "true",
    "columns[5][orderable]": "true",
    "columns[5][search][value]": "",
    "columns[5][search][regex]": "false",
    "columns[6][data]": "6",
    "columns[6][name]": "Summary",
    "columns[6][searchable]": "true",
    "columns[6][orderable]": "true",
    "columns[6][search][value]": "",
    "columns[6][search][regex]": "false",
    "columns[7][data]": "7",
    "columns[7][name]": "Reported",
    "columns[7][searchable]": "true",
    "columns[7][orderable]": "true",
    "columns[7][search][value]": "",
    "columns[7][search][regex]": "false",
    "columns[8][data]": "8",
    "columns[8][name]": "HasImage",
    "columns[8][searchable]": "true",
    "columns[8][orderable]": "true",
    "columns[8][search][value]": "",
    "columns[8][search][regex]": "false",
    "columns[9][data]": "9",
    "columns[9][name]": "Explanation",
    "columns[9][searchable]": "true",
    "columns[9][orderable]": "true",
    "columns[9][search][value]": "",
    "columns[9][search][regex]": "false",
    "order[0][column]": "1",
    "order[0][dir]": "desc",
    start: start.toString(),
    length: PAGE_SIZE.toString(),
    "search[value]": "",
    "search[regex]": "false",
    wdtNonce: WDT_NONCE,
  })

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
    const data = await resp.json() as NuforcApiResponse
    return (data && data.data) ? data.data : []
  } catch (error) {
    console.error("Error parsing JSON response:", error)
    throw new Error(`Failed to parse JSON response: ${error}`)
  }
}

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
        console.error('Invalid value for --max-records. Must be a positive number.');
        process.exit(1);
      }
    } else if (arg === '--max-records' && i + 1 < argv.length) {
      maxRecords = Number(argv[i + 1]);
      if (!Number.isFinite(maxRecords) || maxRecords <= 0) {
        console.error('Invalid value for --max-records. Must be a positive number.');
        process.exit(1);
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

async function main() {
  if (!WDT_NONCE) {
    console.error("ERROR: WDT_NONCE environment variable is required. Visit nuforc.org/subndx/?id=all and inspect the page source for wdtNonceFrontendServerSide to obtain it.")
    process.exit(1)
  }

  const parsed = parseArgs(process.argv);
  let maxRecords = parsed.maxRecords ?? MAX_RECORDS;
  let force = parsed.force;
  let pretty = parsed.pretty;

  let allSightings: Sighting[] = []
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
            // We've already reached the limit, don't add more
            console.log(`Already reached maximum of ${maxRecords} records, stopping scrape`)
            moreData = false;
          } else if (remainingSlots < sightings.length) {
            // Only add up to the limit
            console.log(`Adding ${remainingSlots} more records to reach limit of ${maxRecords}`)
            allSightings.push(...sightings.slice(0, remainingSlots))
            console.log(`Reached maximum of ${maxRecords} records, stopping scrape`)
            moreData = false;
          } else {
            // Add all sightings from this page
            allSightings.push(...sightings)
            console.log(`Now have ${allSightings.length}/${maxRecords} records`)
            if (allSightings.length === maxRecords) {
              console.log(`Exactly reached maximum of ${maxRecords} records, stopping scrape`)
              moreData = false;
            }
          }
        } else {
          // No max limit, add all sightings
          allSightings.push(...sightings)
        }

        // Only increment if we're continuing
        if (moreData) {
          start += PAGE_SIZE
          draw += 1
          retryCount = 0 // Reset retry counter on success
        }

        // Add delay between requests to avoid rate limiting
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

  console.log(`Scraped ${allSightings.length} sightings. Writing to nuforc-results.json...`)

  const outputFile = "nuforc-results.json"
  const tmpFile = "nuforc-results.tmp.json"
  const jsonContent = pretty ? JSON.stringify(allSightings, null, 2) : JSON.stringify(allSightings)

  try {
    fs.writeFileSync(tmpFile, jsonContent)

    if (!maxRecords && fs.existsSync(outputFile)) {
      try {
        const existing = JSON.parse(fs.readFileSync(outputFile, "utf-8")) as unknown[]
        if (shouldAbortWrite(allSightings.length, existing.length, force)) {
          fs.unlinkSync(tmpFile)
          console.error(`ABORTED: New scrape has ${allSightings.length} records but existing file has ${existing.length}. This looks like a failed scrape. Use --force to overwrite anyway.`)
          process.exit(1)
        }
      } catch {
        // If we can't parse the existing file, proceed with overwrite
      }
    }

    fs.renameSync(tmpFile, outputFile)
    console.log("Successfully wrote data to nuforc-results.json")
  } catch (error) {
    console.error("Error writing to file:", error)
    const backupFilename = `nuforc-results-backup-${Date.now()}.json`
    console.log(`Attempting to write to backup file: ${backupFilename}`)
    try {
      fs.writeFileSync(backupFilename, jsonContent)
      console.log(`Successfully wrote data to backup file: ${backupFilename}`)
    } catch (backupError) {
      console.error("Backup write also failed:", backupError)
      console.error(`${allSightings.length} records were scraped but could not be saved.`)
    }
  }

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
