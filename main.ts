import puppeteer, { Browser, Page } from 'puppeteer';
import * as fs  from "fs"

type PerformanceData = {
    schoolName: string;
    divisionPerformance: string[][];
    overallPerformance: string[][];
}

const getPageBody  = async (url: string) => {
    console.log(`Fetching ${url}...`)
    const res = await fetch(url)
    const text = await res.text()
    return text
}

const getSchoolLinks = (document: string) => {
    const hrefRegex = /HREF="(.*?)"/g
    const links = document.match(hrefRegex)
    const cleanedLinks = links  && links.filter(l => l.includes("result")).map(link => link.replace(hrefRegex, '$1'))
    return cleanedLinks? cleanedLinks.map(link => `https://matokeo.necta.go.tz/csee2022/${link.replace('\\', '/')}`) : []
}


const divisionHeaderRow = ["I", "II", "III", "IV", "0"]
const divisionHeaderColumns = ["F", "M", "T"]
const overallHeaderColumns = ["EXAMINATION CENTRE REGION", "TOTAL PASSED CANDIDATES", "EXAMINATION CENTRE GPA"]

const singleRowHeader =["School name",  ...divisionHeaderColumns.map(c => divisionHeaderRow.map(r => `${c}${r}`)).flat(), ...overallHeaderColumns]

const getSchoolResults = async (browser: Browser, link: string): Promise<PerformanceData> => {
    console.log("sch t", link)

    const page = await browser.newPage();
    await page.goto(link)

    const perfomanceData = await page.evaluate(() => {
        const firstH3 = document.getElementsByTagName('h3')[0]
        const schoolName = firstH3.innerText
        const tables = document.getElementsByTagName("table")
        const firstTable =  tables[0]
        const tableRows = Array.from(firstTable.getElementsByTagName("tr"))
        const divisionPerformance = tableRows.map(row => 
            Array.from(row.getElementsByTagName("td")).map(d => d.innerText)
        )

        const table4 = tables[4]
        const overallPerformanceRows = Array.from(table4.getElementsByTagName("tr"))
        const overallPerformance = overallPerformanceRows.map(row => Array.from(row.getElementsByTagName("td")).map(d => d.innerText))
        
        return {schoolName, divisionPerformance, overallPerformance}
    })

    page.close()

    return perfomanceData
}

const isString = (s: string | undefined): s is string => !!s

const flattenPerformanceData = (data: PerformanceData): string[] => {

    const divisionRows =  divisionHeaderColumns.map(h => data.divisionPerformance.find(row => row[0] === h))
    const divisionSingleRow = divisionRows.map(row => row ? row.slice(1) : []).flat()

    // there should be 5 columns and 3 rows 
    if (divisionSingleRow.length !== 15) {
        console.error(divisionSingleRow)
        throw new Error(`Error parsing results for school ${data.schoolName}`)
    }

    const overallSingleRow = overallHeaderColumns.map(h => data.overallPerformance.find(row => row[0] === h)?.[1]).filter(isString)

    return [data.schoolName, ...divisionSingleRow, ...overallSingleRow]
}

const main = async () => {
    const body = await getPageBody('https://matokeo.necta.go.tz/csee2022/')
    const resultsLinks = getSchoolLinks(body)

    const browser = await puppeteer.launch({ args: ["--no-sandbox"], headless: false });

    const resultsFile = "results.csv"

    let parsedRows = [singleRowHeader]
    fs.writeFileSync(resultsFile, singleRowHeader.join(", ")+ "\n")


    for (let i = 0; i < resultsLinks.length; i++) {
        const divisionPerformance = await getSchoolResults(browser, resultsLinks[i])
        const parsedPerformance = flattenPerformanceData(divisionPerformance)
        console.log(`Writing school ${divisionPerformance.schoolName}`, parsedPerformance)
        const schoolRow = parsedPerformance.join(", ") + "\n"
        await fs.appendFileSync(resultsFile, schoolRow)
        parsedRows.push(parsedPerformance)
    }

    await browser.close()

}
main()