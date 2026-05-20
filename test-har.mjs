import { extractPurchaseTemplate } from './src/utils/har-parser.js'
import { readFileSync } from 'fs'

const content = readFileSync('C:/Users/孔慧/Desktop/1.har', 'utf8')
const result = extractPurchaseTemplate(content)

if (result.error) {
  console.log('ERROR:', result.error)
} else {
  console.log('SUCCESS! Found', result.steps.length, 'steps:')
  for (const s of result.steps) {
    console.log('  Step', s.step, ':', s.name)
    console.log('    URL:', s.url)
    console.log('    Replacements:', Object.keys(s.replacements).join(', ') || 'none')
    const bodyKeys = typeof s.body === 'object' ? Object.keys(s.body).join(', ') : 'string'
    console.log('    Body keys:', bodyKeys)
  }
  console.log('Total weidian POSTs:', result.totalFound)
  console.log('Template name:', result.templateName)
}
