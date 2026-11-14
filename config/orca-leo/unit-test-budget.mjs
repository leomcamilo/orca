// Orca Leo's gate runs the unit tests closest to a change, within a budget of test cases, instead of
// every test Vitest's import graph relates to it. A change to the translation catalogs relates almost
// the whole suite, which held each build for over twenty minutes.
// Order: the test files the change touched, then the `<stem>.test.*` / `<stem>.*.test.*` siblings of
// the files it touched, then the other tests in their folders. A file that would pass the budget is
// left out and named. The critical tests (critical-tests.mjs) run in full in their own job, so they
// are not counted here; `--critical` runs them.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { collectChangedFiles } from '../scripts/preflight/changed-checks/check-changed-pass-cache.mjs'
import { isCriticalTest } from './critical-tests.mjs'

const UNIT_TEST_FILE = /\.test\.[cm]?[jt]sx?$/
const SOURCE_FILE = /\.[cm]?[jt]sx?$/
const VITEST = 'config/scripts/test-runtime/execution-policy/run-vitest.mjs'

function option(argv, name, fallback) {
  const found = argv.find((argument) => argument.startsWith(`--${name}=`))
  return found ? found.slice(name.length + 3) : fallback
}

/** Test files nearest the change, in the order the budget spends on them. */
export function nearestTestFiles(changed, listDirectory, exists) {
  const picked = []
  const add = (file) => {
    if (!picked.includes(file) && exists(file)) {
      picked.push(file)
    }
  }
  for (const file of changed) {
    if (UNIT_TEST_FILE.test(file)) {
      add(file)
    }
  }
  for (const file of changed) {
    if (UNIT_TEST_FILE.test(file) || !SOURCE_FILE.test(file)) {
      continue
    }
    const slash = file.lastIndexOf('/')
    const directory = file.slice(0, slash + 1)
    const stem = file.slice(slash + 1).replace(/\.[^.]+$/, '')
    for (const name of listDirectory(directory).sort()) {
      if (UNIT_TEST_FILE.test(name) && name.startsWith(`${stem}.`)) {
        add(directory + name)
      }
    }
  }
  // Then the other tests beside the changed files, which most often break along with them.
  const folders = new Set(changed.map((file) => file.slice(0, file.lastIndexOf('/') + 1)))
  for (const directory of folders) {
    for (const name of listDirectory(directory).sort()) {
      if (UNIT_TEST_FILE.test(name)) {
        add(directory + name)
      }
    }
  }
  return picked
}

/** Whole files in order while they fit; the rest are left out. */
export function withinBudget(files, counts, budget) {
  const chosen = []
  const left = []
  let total = 0
  for (const file of files) {
    const count = counts.get(file) ?? 0
    if (total + count <= budget) {
      chosen.push(file)
      total += count
    } else {
      left.push({ file, count })
    }
  }
  return { chosen, left, total }
}

// Matches no test name, so a run collects every case the way a real run would (tables expanded,
// a file run under each project that takes it) and executes none.
const COLLECT_ONLY = '^ORCA_LEO_COLLECT_ONLY_NO_TEST_HAS_THIS_NAME$'

/** Test cases per file, counted the way the run will count them. A file that collects no case
 *  registers its tests some other way, so its size is unknown and it stays out. */
function countTests(root, files) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'orca-leo-test-count-'))
  const output = path.join(directory, 'tests.json')
  try {
    const collected = spawnSync(
      process.execPath,
      [
        VITEST,
        'run',
        '--config',
        'config/vitest.config.ts',
        '--passWithNoTests',
        `--testNamePattern=${COLLECT_ONLY}`,
        '--reporter=json',
        `--outputFile=${output}`,
        ...files
      ],
      { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: process.env }
    )
    if (!existsSync(output)) {
      throw new Error(`counting the tests failed:\n${collected.stdout}${collected.stderr}`)
    }
    const counts = new Map(files.map((file) => [file, 0]))
    for (const result of JSON.parse(readFileSync(output, 'utf8')).testResults ?? []) {
      const file = path.relative(root, result.name)
      counts.set(file, (counts.get(file) ?? 0) + (result.assertionResults?.length ?? 0))
    }
    return { counts, unlisted: files.filter((file) => !(counts.get(file) > 0)) }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

/** Every critical test, with no budget: they guard data and the installation. */
function runCritical(root, maxWorkers) {
  const files = execFileSync('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024
  })
    .split('\0')
    .filter((file) => file && isCriticalTest(file) && existsSync(path.join(root, file)))
  console.log(`critical tests: ${files.length} file(s), run in full.`)
  if (files.length === 0) {
    return 0
  }
  const run = spawnSync(
    process.execPath,
    [VITEST, 'run', '--config', 'config/vitest.config.ts', `--maxWorkers=${maxWorkers}`, ...files],
    { cwd: root, stdio: 'inherit', env: process.env }
  )
  return run.status ?? 1
}

function main() {
  const root = process.cwd()
  const argv = process.argv.slice(2)
  const base = option(argv, 'base', null)
  const budget = Number(option(argv, 'budget', '700'))
  const maxWorkers = option(argv, 'maxWorkers', '3')
  if (argv.includes('--critical')) {
    return runCritical(root, maxWorkers)
  }
  if (!base || !Number.isSafeInteger(budget) || budget < 0) {
    console.error(
      'Usage: unit-test-budget.mjs --base=<ref> [--budget=700] [--maxWorkers=3] | --critical'
    )
    return 2
  }
  const mergeBase = execFileSync('git', ['merge-base', base, 'HEAD'], {
    cwd: root,
    encoding: 'utf8'
  }).trim()
  const files = nearestTestFiles(
    collectChangedFiles(root, mergeBase),
    (directory) => {
      try {
        return readdirSync(path.join(root, directory)).map(String)
      } catch {
        return []
      }
    },
    (file) => existsSync(path.join(root, file))
  ).filter((file) => !isCriticalTest(file))
  if (files.length === 0) {
    console.log('unit-test budget: no test file near the change.')
    return 0
  }
  const { counts, unlisted } = countTests(root, files)
  const { chosen, left, total } = withinBudget(
    files.filter((file) => !unlisted.includes(file)),
    counts,
    budget
  )
  console.log(`unit-test budget: ${total} of ${budget} test(s) in ${chosen.length} file(s).`)
  for (const { file, count } of left) {
    console.log(`  left out, over the budget: ${file} (${count} test(s))`)
  }
  for (const file of unlisted) {
    console.log(`  left out, cannot be counted: ${file}`)
  }
  if (chosen.length === 0) {
    return 0
  }
  const run = spawnSync(
    process.execPath,
    [VITEST, 'run', '--config', 'config/vitest.config.ts', `--maxWorkers=${maxWorkers}`, ...chosen],
    { cwd: root, stdio: 'inherit', env: process.env }
  )
  return run.status ?? 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main()
}
