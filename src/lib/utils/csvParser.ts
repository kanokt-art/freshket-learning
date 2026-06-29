import Papa from 'papaparse'
import type { CSVImportError } from '@/types/tracking'

export interface ParsedEmployee {
  employeeId: string
  email: string
  displayName: string
  role: string
  teamId?: string
  department?: string
  position?: string
}

export interface ParsedTrainingResult {
  employeeEmail: string
  courseId: string
  courseTitle: string
  status: string
  score?: number
  completedAt?: string
}

export interface ParseResult<T> {
  data: T[]
  errors: CSVImportError[]
}

const EMPLOYEE_REQUIRED_FIELDS = ['employeeId', 'email', 'displayName', 'role']
const TRAINING_REQUIRED_FIELDS = ['employeeEmail', 'courseId', 'courseTitle', 'status']

export function parseEmployeeCSV(file: File): Promise<ParseResult<ParsedEmployee>> {
  return new Promise((resolve) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: ({ data, errors: parseErrors }) => {
        const csvErrors: CSVImportError[] = parseErrors.map((e) => ({
          row: e.row ?? 0,
          field: 'parse',
          message: e.message,
          rawValue: '',
        }))

        const employees: ParsedEmployee[] = []

        data.forEach((row, idx) => {
          const rowNum = idx + 2 // header is row 1

          for (const field of EMPLOYEE_REQUIRED_FIELDS) {
            if (!row[field]?.trim()) {
              csvErrors.push({ row: rowNum, field, message: `ต้องกรอก ${field}`, rawValue: row[field] ?? '' })
              return
            }
          }

          const email = row.email?.trim().toLowerCase()
          if (!email.endsWith('@freshket.co')) {
            csvErrors.push({ row: rowNum, field: 'email', message: 'อีเมลต้องเป็น @freshket.co', rawValue: email })
            return
          }

          employees.push({
            employeeId: row.employeeId.trim(),
            email,
            displayName: row.displayName.trim(),
            role: row.role.trim(),
            teamId: row.teamId?.trim(),
            department: row.department?.trim(),
            position: row.position?.trim(),
          })
        })

        resolve({ data: employees, errors: csvErrors })
      },
    })
  })
}

export function parseTrainingResultCSV(file: File): Promise<ParseResult<ParsedTrainingResult>> {
  return new Promise((resolve) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: ({ data, errors: parseErrors }) => {
        const csvErrors: CSVImportError[] = parseErrors.map((e) => ({
          row: e.row ?? 0,
          field: 'parse',
          message: e.message,
          rawValue: '',
        }))

        const results: ParsedTrainingResult[] = []

        data.forEach((row, idx) => {
          const rowNum = idx + 2

          for (const field of TRAINING_REQUIRED_FIELDS) {
            if (!row[field]?.trim()) {
              csvErrors.push({ row: rowNum, field, message: `ต้องกรอก ${field}`, rawValue: row[field] ?? '' })
              return
            }
          }

          const score = row.score ? parseFloat(row.score) : undefined
          if (score !== undefined && (isNaN(score) || score < 0 || score > 100)) {
            csvErrors.push({ row: rowNum, field: 'score', message: 'คะแนนต้องอยู่ระหว่าง 0-100', rawValue: row.score })
            return
          }

          results.push({
            employeeEmail: row.employeeEmail.trim().toLowerCase(),
            courseId: row.courseId.trim(),
            courseTitle: row.courseTitle.trim(),
            status: row.status.trim(),
            score,
            completedAt: row.completedAt?.trim(),
          })
        })

        resolve({ data: results, errors: csvErrors })
      },
    })
  })
}
