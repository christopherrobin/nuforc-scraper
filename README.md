# NUFORC UFO Sighting Scraper

[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)]()
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)]()
[![Vitest](https://img.shields.io/badge/Vitest-1b7a3d?style=for-the-badge&logo=vitest&logoColor=white)]()
[![MIT License](https://img.shields.io/badge/license-MIT-333333?style=for-the-badge)](LICENSE)
[![Tests](https://img.shields.io/github/actions/workflow/status/christopherrobin/nuforc-scraper/test.yml?style=for-the-badge&label=tests&color=1b7a3d)](https://github.com/christopherrobin/nuforc-scraper/actions/workflows/test.yml)

A Node.js/TypeScript scraper that collects UFO sighting data from the [National UFO Reporting Center (NUFORC)](https://nuforc.org) database.

## Features

- Scrapes all UFO sighting reports from https://nuforc.org/subndx/?id=all
- Paginates through all available records
- Handles rate limiting with configurable delays
- Provides robust error handling and retry logic
- Outputs normalized JSON data

## Installation

```bash
yarn install
```

## Configuration

The scraper can be configured using environment variables:

- `WDT_NONCE`: **Required.** The NUFORC website's nonce value. Visit nuforc.org/subndx/?id=all and inspect the page source for `wdtNonceFrontendServerSide` to obtain it
- `REQUEST_DELAY`: Delay between requests in milliseconds (defaults to 1000ms)
- `MAX_RECORDS`: Maximum number of records to scrape (optional, for testing)

## Usage

Run the scraper to collect all records:

```bash
yarn scrape
```

For testing purposes, you can limit the number of records:

```bash
yarn scrape --max-records=10
```

Or using the start script:

```bash
yarn start --max-records=10
```

## Output

The scraper outputs all UFO sighting data to `nuforc-results.json` in the following format:

```typescript
type Sighting = {
  id: string                // Unique id from the URL param in the 'href'
  href: string              // Relative link to the original sighting details page
  occurredAt: string        // Date and time the sighting occurred
  city: string | null       // City (can be null)
  state: string | null      // State/province/region (can be null)
  country: string | null    // Country (can be null)
  shape: string | null      // Shape reported
  summary: string | null    // Summary text of the report
  reportedAt: string | null // Date it was reported
  mediaIncluded: boolean    // Whether a photo or video was included
  explanation: string | null // Explanation, if any (can be null)
}
```

## Testing

Run the test suite:

```bash
yarn test
```

Run tests in watch mode:

```bash
yarn test:watch
```

## Development

Build the TypeScript code:

```bash
yarn build
```

This will compile the TypeScript code to JavaScript in the `dist` directory.
