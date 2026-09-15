// Shared model + mock data for Cuisine Guide — a guide telling sale reps which
// products/SKUs to pitch when they walk into a restaurant of a given cuisine
// (e.g. "walked into an Italian place → lead with these SKUs"). Same shape as
// Mandatory Reading (tools/mandatory): Firestore-backed, super_admin-authored,
// everyone signed in reads.

export interface CuisineSku {
  id: string
  fktId: string
  itemName: string
  price: number
  pvpPrice: number
}

export interface CuisineGuideItem {
  id: string
  name: string
  description: string
  coverUrl: string
  isPublished: boolean
  skus: CuisineSku[]
  createdAt: Date
  updatedAt: Date
  createdBy?: string
}

export function formatBaht(n: number): string {
  return `฿${n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}

// ── Mock data — placeholder until real SKU data is provided ──────────────────
// Cover photos are Unsplash stock (same convention as SEED_TOOLS in
// lib/tools.ts), sized down for a card thumbnail rather than a full photo —
// swap for real photography whenever it's available. Naming is
// "English (ไทย)" throughout, e.g. "Japanese Restaurant (ร้านอาหารญี่ปุ่น)".
export const MOCK_CUISINE_GUIDES: CuisineGuideItem[] = [
  {
    id: 'cuisine-italian',
    name: 'Italian Restaurant (ร้านอาหารอิตาเลียน)',
    description: 'ร้านพาสต้า พิซซ่า และอาหารอิตาเลียน — เน้นชีส มะเขือเทศ และเนื้อสัตว์แปรรูป',
    coverUrl: 'https://images.unsplash.com/photo-1595295333158-4742f28fbd85?auto=format&fit=crop&w=360&h=140&q=65',
    isPublished: true,
    createdAt: new Date('2026-06-01'),
    updatedAt: new Date('2026-06-01'),
    skus: [
      { id: 'sku-it-1', fktId: 'FKT-10001', itemName: 'มอสซาเรลล่าชีส 1kg', price: 320, pvpPrice: 289 },
      { id: 'sku-it-2', fktId: 'FKT-10002', itemName: 'พาร์เมซานชีสขูด 500g', price: 450, pvpPrice: 399 },
      { id: 'sku-it-3', fktId: 'FKT-10003', itemName: 'มะเขือเทศซานมาร์ซาโน กระป๋อง', price: 95, pvpPrice: 85 },
      { id: 'sku-it-4', fktId: 'FKT-10004', itemName: 'เบคอนอิตาเลียน (Pancetta) 1kg', price: 580, pvpPrice: 520 },
      { id: 'sku-it-5', fktId: 'FKT-10005', itemName: 'เส้นพาสต้าเซโมลิน่า 500g', price: 65, pvpPrice: 58 },
    ],
  },
  {
    id: 'cuisine-japanese',
    name: 'Japanese Restaurant (ร้านอาหารญี่ปุ่น)',
    description: 'ร้านซูชิ ราเมง และอาหารญี่ปุ่น — เน้นอาหารทะเลสด และวัตถุดิบพรีเมียม',
    coverUrl: 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=360&h=140&q=65',
    isPublished: true,
    createdAt: new Date('2026-06-02'),
    updatedAt: new Date('2026-06-02'),
    skus: [
      { id: 'sku-jp-1', fktId: 'FKT-20001', itemName: 'แซลมอนนอร์เวย์ ซาชิมิเกรด 1kg', price: 890, pvpPrice: 799 },
      { id: 'sku-jp-2', fktId: 'FKT-20002', itemName: 'ข้าวญี่ปุ่นเกรดพรีเมียม 5kg', price: 420, pvpPrice: 380 },
      { id: 'sku-jp-3', fktId: 'FKT-20003', itemName: 'สาหร่ายโนริ (100 แผ่น)', price: 280, pvpPrice: 250 },
      { id: 'sku-jp-4', fktId: 'FKT-20004', itemName: 'ซอสโชยุพรีเมียม 1L', price: 180, pvpPrice: 165 },
    ],
  },
  {
    id: 'cuisine-thai',
    name: 'Thai Restaurant (ร้านอาหารไทย)',
    description: 'ร้านอาหารไทยทั่วไป — เน้นผักสด สมุนไพร และเครื่องปรุงรสไทย',
    coverUrl: 'https://images.unsplash.com/photo-1746973645769-c11eb0a81025?auto=format&fit=crop&w=360&h=140&q=65',
    isPublished: true,
    createdAt: new Date('2026-06-03'),
    updatedAt: new Date('2026-06-03'),
    skus: [
      { id: 'sku-th-1', fktId: 'FKT-30001', itemName: 'ผักบุ้งไทยออร์แกนิก 1kg', price: 45, pvpPrice: 39 },
      { id: 'sku-th-2', fktId: 'FKT-30002', itemName: 'กะทิสด 1L', price: 65, pvpPrice: 58 },
      { id: 'sku-th-3', fktId: 'FKT-30003', itemName: 'พริกขี้หนูสวน 1kg', price: 120, pvpPrice: 105 },
      { id: 'sku-th-4', fktId: 'FKT-30004', itemName: 'ใบมะกรูดสด 100g', price: 35, pvpPrice: 30 },
      { id: 'sku-th-5', fktId: 'FKT-30005', itemName: 'น้ำปลาแท้ 700ml', price: 55, pvpPrice: 48 },
    ],
  },
  {
    id: 'cuisine-chinese',
    name: 'Chinese Restaurant (ร้านอาหารจีน)',
    description: 'ร้านอาหารจีน ติ่มซำ และก๋วยเตี๋ยว — เน้นเนื้อสัตว์แปรรูป และผักตามฤดูกาล',
    coverUrl: 'https://images.unsplash.com/photo-1563245372-f21724e3856d?auto=format&fit=crop&w=360&h=140&q=65',
    isPublished: false,
    createdAt: new Date('2026-06-04'),
    updatedAt: new Date('2026-06-04'),
    skus: [
      { id: 'sku-cn-1', fktId: 'FKT-40001', itemName: 'หมูสามชั้น 1kg', price: 210, pvpPrice: 189 },
      { id: 'sku-cn-2', fktId: 'FKT-40002', itemName: 'ซีอิ๊วดำ 1L', price: 75, pvpPrice: 65 },
      { id: 'sku-cn-3', fktId: 'FKT-40003', itemName: 'ผักกาดขาว 1kg', price: 30, pvpPrice: 26 },
    ],
  },
  // ── Added later — no real SKU data yet, so skus is empty until it's
  // provided. All start unpublished (Draft) since an empty product list isn't
  // useful for a learner to open yet; publish once SKUs are filled in.
  {
    id: 'cuisine-western',
    name: 'Western Restaurant (ร้านอาหารตะวันตก)',
    description: 'ร้านอาหารตะวันตก',
    coverUrl: 'https://images.unsplash.com/photo-1663530761401-15eefb544889?auto=format&fit=crop&w=360&h=140&q=65',
    isPublished: false,
    createdAt: new Date('2026-09-07'),
    updatedAt: new Date('2026-09-07'),
    skus: [],
  },
  {
    id: 'cuisine-cafe-bakery',
    name: 'Café & Bakery (ร้านกาแฟและเบเกอรี่)',
    description: 'ร้านกาแฟและเบเกอรี่',
    coverUrl: 'https://images.unsplash.com/photo-1565252556328-92ee4a9a0983?auto=format&fit=crop&w=360&h=140&q=65',
    isPublished: false,
    createdAt: new Date('2026-09-07'),
    updatedAt: new Date('2026-09-07'),
    skus: [],
  },
  {
    id: 'cuisine-beef',
    name: 'Beef Restaurant (ร้านอาหารประเภทเนื้อ / ร้านสเต็ก)',
    description: 'ร้านอาหารประเภทเนื้อ / ร้านสเต็ก',
    coverUrl: 'https://images.unsplash.com/photo-1546964124-0cce460f38ef?auto=format&fit=crop&w=360&h=140&q=65',
    isPublished: false,
    createdAt: new Date('2026-09-07'),
    updatedAt: new Date('2026-09-07'),
    skus: [],
  },
  {
    id: 'cuisine-fruit-produce',
    name: 'Fruit & Produce (ร้านน้ำผลไม้และผลไม้สด)',
    description: 'ร้านน้ำผลไม้และผลไม้สด',
    coverUrl: 'https://images.unsplash.com/photo-1610832958506-aa56368176cf?auto=format&fit=crop&w=360&h=140&q=65',
    isPublished: false,
    createdAt: new Date('2026-09-07'),
    updatedAt: new Date('2026-09-07'),
    skus: [],
  },
  {
    id: 'cuisine-non-food',
    name: 'Non-Food (อุปกรณ์และของใช้ในร้านอาหาร)',
    description: 'อุปกรณ์และของใช้ในร้านอาหาร',
    coverUrl: 'https://images.unsplash.com/photo-1588416820614-f8d6ac6cea56?auto=format&fit=crop&w=360&h=140&q=65',
    isPublished: false,
    createdAt: new Date('2026-09-07'),
    updatedAt: new Date('2026-09-07'),
    skus: [],
  },
  {
    id: 'cuisine-beer-beverage',
    name: 'Beer & Beverage (เบียร์และเครื่องดื่ม)',
    description: 'เบียร์และเครื่องดื่ม',
    coverUrl: 'https://images.unsplash.com/photo-1608270586620-248524c67de9?auto=format&fit=crop&w=360&h=140&q=65',
    isPublished: false,
    createdAt: new Date('2026-09-07'),
    updatedAt: new Date('2026-09-07'),
    skus: [],
  },
  {
    id: 'cuisine-korean',
    name: 'Korean Restaurant (ร้านอาหารเกาหลี)',
    description: 'ร้านอาหารเกาหลี',
    coverUrl: 'https://images.unsplash.com/photo-1498654896293-37aacf113fd9?auto=format&fit=crop&w=360&h=140&q=65',
    isPublished: false,
    createdAt: new Date('2026-09-07'),
    updatedAt: new Date('2026-09-07'),
    skus: [],
  },
  {
    id: 'cuisine-seafood',
    name: 'Seafood Restaurant (ร้านอาหารทะเล)',
    description: 'ร้านอาหารทะเล',
    coverUrl: 'https://images.unsplash.com/photo-1615141982883-c7ad0e69fd62?auto=format&fit=crop&w=360&h=140&q=65',
    isPublished: false,
    createdAt: new Date('2026-09-07'),
    updatedAt: new Date('2026-09-07'),
    skus: [],
  },
  {
    id: 'cuisine-buffet',
    name: 'Buffet (ร้านบุฟเฟต์)',
    description: 'ร้านบุฟเฟต์',
    coverUrl: 'https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=360&h=140&q=65',
    isPublished: false,
    createdAt: new Date('2026-09-07'),
    updatedAt: new Date('2026-09-07'),
    skus: [],
  },
  {
    id: 'cuisine-fast-food',
    name: 'Fast Food (ร้านอาหารจานด่วน)',
    description: 'ร้านอาหารจานด่วน',
    coverUrl: 'https://images.unsplash.com/photo-1571091718767-18b5b1457add?auto=format&fit=crop&w=360&h=140&q=65',
    isPublished: false,
    createdAt: new Date('2026-09-07'),
    updatedAt: new Date('2026-09-07'),
    skus: [],
  },
  {
    id: 'cuisine-vegetarian-vegan',
    name: 'Vegetarian / Vegan Restaurant (ร้านอาหารมังสวิรัติและวีแกน)',
    description: 'ร้านอาหารมังสวิรัติและวีแกน',
    coverUrl: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=360&h=140&q=65',
    isPublished: false,
    createdAt: new Date('2026-09-07'),
    updatedAt: new Date('2026-09-07'),
    skus: [],
  },
  {
    id: 'cuisine-indian',
    name: 'Indian Restaurant (ร้านอาหารอินเดีย)',
    description: 'ร้านอาหารอินเดีย',
    coverUrl: 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=360&h=140&q=65',
    isPublished: false,
    createdAt: new Date('2026-09-07'),
    updatedAt: new Date('2026-09-07'),
    skus: [],
  },
  {
    id: 'cuisine-pub',
    name: 'Pub & Restaurant (ร้านอาหารกึ่งผับและบาร์)',
    description: 'ร้านอาหารกึ่งผับและบาร์',
    coverUrl: 'https://images.unsplash.com/photo-1470337458703-46ad1756a187?auto=format&fit=crop&w=360&h=140&q=65',
    isPublished: false,
    createdAt: new Date('2026-09-07'),
    updatedAt: new Date('2026-09-07'),
    skus: [],
  },
]
