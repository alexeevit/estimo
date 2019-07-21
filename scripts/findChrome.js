const path = require('path')
const ProgressBar = require('progress')
const { execSync } = require('child_process')

const puppeteer = require('puppeteer-core')
const pptrCoreJson = require('puppeteer-core/package.json')
const { writeFile } = require('../src/utils')

const chromeTempPath = path.join(process.cwd(), 'temp', 'chrome')
const downloadHost = process.env.PUPPETEER_DOWNLOAD_HOST || process.env.npm_config_puppeteer_download_host || process.env.npm_package_config_puppeteer_download_host
const browserFetcher = puppeteer.createBrowserFetcher({ host: downloadHost, path: chromeTempPath })

const revision = process.env.PUPPETEER_CHROMIUM_REVISION || pptrCoreJson.puppeteer.chromium_revision

function logPolitely(toBeLogged) {
  const logLevel = process.env.npm_config_loglevel
  const logLevelDisplay = ['silent', 'error', 'warn'].indexOf(logLevel) > -1

  if (!logLevelDisplay)
    console.log(toBeLogged)
}

async function findChromium() {
  const revisionInfo = browserFetcher.revisionInfo(revision)
  if (revisionInfo.local) {
    logPolitely(`Chromium r${revision} found local at ${revisionInfo.executablePath}`)
    return revisionInfo
  }

  throw new Error(`Chromium r${revision} not found local`)
}

function toMegabytes(bytes) {
  const mb = bytes / 1024 / 1024
  return `${Math.round(mb * 10) / 10} Mb`
}

let progressBar = null
let lastDownloadedBytes = 0
function onProgress(downloadedBytes, totalBytes) {
  if (!progressBar) {
    progressBar = new ProgressBar(`Downloading Chromium r${revision} - ${toMegabytes(totalBytes)} [:bar] :percent :etas `, {
      complete: '=',
      incomplete: ' ',
      width: 20,
      total: totalBytes,
    })
  }
  const delta = downloadedBytes - lastDownloadedBytes
  lastDownloadedBytes = downloadedBytes
  progressBar.tick(delta)
}

async function downloadChromium() {
  return browserFetcher.download(revision, onProgress)
}

async function writeChromeConfig(config) {
  const chromeConfigPath = path.join(process.cwd(), 'chrome.json')
  await writeFile(chromeConfigPath, JSON.stringify(config))
}

function onSuccess(revisionInfo) {
  const chromiumVersionResult = execSync(
    `${revisionInfo.executablePath} --version`
  )

  const chromiumMajorVersion = chromiumVersionResult.toString().match(/Chromium (\d*)\..*/i)[1]
  if (parseInt(chromiumMajorVersion, 10) < 75) {
    console.log("ERROR: Estimo doesn't support Chromium version < 75")
    throw new Error('Chromium version < 75')
  }

  writeChromeConfig({ executablePath: revisionInfo.executablePath })
  return revisionInfo
}

function onSuccessfulDownload(revisionInfo) {
  logPolitely(`Chromium successfully downloaded to ${revisionInfo.folderPath}`)
}

function onFailedDownload(error) {
  console.error(`ERROR: Failed to download Chromium r${revision}! Set "PUPPETEER_SKIP_CHROMIUM_DOWNLOAD" env variable to skip download.`)
  console.error(error)
  process.exit(1)
}

if (process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD) {
  logPolitely('**INFO** Skipping Chromium download. "PUPPETEER_SKIP_CHROMIUM_DOWNLOAD" environment variable was found.')
  process.exit(1)
}
if (process.env.NPM_CONFIG_PUPPETEER_SKIP_CHROMIUM_DOWNLOAD) {
  logPolitely('**INFO** Skipping Chromium download. "PUPPETEER_SKIP_CHROMIUM_DOWNLOAD" was set in npm config.')
  process.exit(1)
}
if (process.env.NPM_PACKAGE_CONFIG_PUPPETEER_SKIP_CHROMIUM_DOWNLOAD) {
  logPolitely('**INFO** Skipping Chromium download. "PUPPETEER_SKIP_CHROMIUM_DOWNLOAD" was set in project config.')
  process.exit(1)
}

findChromium()
.then(onSuccess)
.catch(() => {
  downloadChromium()
  .then(onSuccess)
  .then(onSuccessfulDownload)
  .catch(onFailedDownload)
})
