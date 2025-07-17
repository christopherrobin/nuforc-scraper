import fetch from "node-fetch";
import fs from "fs";
import { parse } from "node-html-parser";
import { setTimeout } from "timers/promises";

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
// Get WDT_NONCE from environment variable or use default (for development only)
const WDT_NONCE = process.env.WDT_NONCE || "bb79a2a426"
// Delay between requests in milliseconds to avoid rate limiting
const REQUEST_DELAY = process.env.REQUEST_DELAY ? parseInt(process.env.REQUEST_DELAY) : 1000
// Maximum number of records to scrape (optional, for testing)
const MAX_RECORDS = process.env.MAX_RECORDS ? parseInt(process.env.MAX_RECORDS) : undefined

const PAGE_SIZE = 100

const parseSighting = (row: any[]): Sighting => {
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
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
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

async function main() {
  // Parse command line arguments
  const args = process.argv;
  let maxRecords: number | undefined = MAX_RECORDS;
  
  // Log all arguments for debugging
  console.log('Command line arguments:', args);
  
  // Check for --max-records in any position
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    // Handle both --max-records=5 and --max-records 5 formats
    if (arg.startsWith('--max-records=')) {
      const value = arg.split('=')[1];
      maxRecords = parseInt(value);
      if (isNaN(maxRecords)) {
        console.error('Invalid value for --max-records. Must be a number.');
        process.exit(1);
      }
    } else if (arg === '--max-records' && i + 1 < args.length) {
      maxRecords = parseInt(args[i + 1]);
      if (isNaN(maxRecords)) {
        console.error('Invalid value for --max-records. Must be a number.');
        process.exit(1);
      }
      i++; // Skip the next argument since we've processed it
    }
  }

  let allSightings: Sighting[] = []
  let draw = 1
  let start = 0
  let moreData = true
  let retryCount = 0
  const maxRetries = 3

  console.log("Starting NUFORC scraping...")
  console.log(`Using WDT_NONCE: ${WDT_NONCE}`)
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
            allSightings = allSightings.concat(sightings.slice(0, remainingSlots))
            console.log(`Reached maximum of ${maxRecords} records, stopping scrape`)
            moreData = false;
          } else {
            // Add all sightings from this page
            allSightings = allSightings.concat(sightings)
            console.log(`Now have ${allSightings.length}/${maxRecords} records`)
            if (allSightings.length === maxRecords) {
              console.log(`Exactly reached maximum of ${maxRecords} records, stopping scrape`)
              moreData = false;
            }
          }
        } else {
          // No max limit, add all sightings
          allSightings = allSightings.concat(sightings)
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
        console.log(`Retry ${retryCount}/${maxRetries} after waiting ${REQUEST_DELAY * 2}ms...`)
        await setTimeout(REQUEST_DELAY * 2) // Wait longer between retries
      }
    }
  }

  console.log(`Scraped ${allSightings.length} sightings. Writing to nuforc-results.json...`)
  
  try {
    fs.writeFileSync("nuforc-results.json", JSON.stringify(allSightings, null, 2))
    console.log("Successfully wrote data to nuforc-results.json")
  } catch (error) {
    console.error("Error writing to file:", error)
    // Try to write to a backup file
    const backupFilename = `nuforc-results-backup-${Date.now()}.json`
    console.log(`Attempting to write to backup file: ${backupFilename}`)
    fs.writeFileSync(backupFilename, JSON.stringify(allSightings, null, 2))
    console.log(`Successfully wrote data to backup file: ${backupFilename}`)
  }
  
  console.log("Done!")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
