import { describe, it, expect } from 'vitest'
import { parsePvpPriceText } from '@/lib/utils/csvParser'

// The real export wraps the Ex-Vat headers onto a second line, so those two
// headers arrive containing a newline inside a quoted field.
const HEADER = 'SKU,NAME,Pack Size,Category,Picture,Public Price,"Public Price\nEx-Vat",Private Price,"Private Price\nEx-Vat",Vat,Remark'

describe('parsePvpPriceText', () => {
  it('reads a row, keeping plain and Ex-Vat prices apart', () => {
    const { data, errors } = parsePvpPriceText(
      `${HEADER}\nFK001,ผักกาดขาว,1 กก.,ผักสด,http://img/1.jpg,107,100,96.30,90,7,หมายเหตุ`,
    )

    expect(errors).toEqual([])
    expect(data).toHaveLength(1)
    expect(data[0]).toEqual({
      sku: 'FK001',
      name: 'ผักกาดขาว',
      packSize: '1 กก.',
      category: 'ผักสด',
      pictureUrl: 'http://img/1.jpg',
      publicPrice: 107,
      publicPriceExVat: 100,
      privatePrice: 96.3,
      privatePriceExVat: 90,
      vat: 7,
      remark: 'หมายเหตุ',
    })
  })

  it('treats a blank price as unknown rather than zero', () => {
    const { data } = parsePvpPriceText(`${HEADER}\nFK002,มะเขือเทศ,,,,,,,,,`)
    expect(data[0].publicPrice).toBeNull()
    expect(data[0].privatePrice).toBeNull()
    expect(data[0].vat).toBeNull()
  })

  it('strips thousands separators and currency marks', () => {
    const { data } = parsePvpPriceText(`${HEADER}\nFK003,ข้าวสาร,,,,"1,250.50",1168.69,"฿1,100",1028,7,`)
    expect(data[0].publicPrice).toBe(1250.5)
    expect(data[0].privatePrice).toBe(1100)
  })

  it('skips blank spacer rows without reporting them', () => {
    const { data, errors } = parsePvpPriceText(`${HEADER}\nFK004,กะหล่ำ,,,,50,46.7,,,7,\n,,,,,,,,,,\n`)
    expect(data).toHaveLength(1)
    expect(errors).toEqual([])
  })

  it('reports a row that has a name but no SKU', () => {
    const { data, errors } = parsePvpPriceText(`${HEADER}\n,ไม่มีรหัส,,,,10,,,,,`)
    expect(data).toHaveLength(0)
    expect(errors[0].field).toBe('sku')
  })

  it('flags a duplicate SKU but still keeps the row', () => {
    const { data, errors } = parsePvpPriceText(
      `${HEADER}\nFK005,รอบแรก,,,,10,,,,,\nFK005,รอบสอง,,,,20,,,,,`,
    )
    expect(data).toHaveLength(2)
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain('ซ้ำ')
  })

  it('fails with one header error when SKU is missing entirely', () => {
    const { data, errors } = parsePvpPriceText('Foo,Bar\n1,2')
    expect(data).toEqual([])
    expect(errors).toHaveLength(1)
    expect(errors[0].field).toBe('header')
  })
})
