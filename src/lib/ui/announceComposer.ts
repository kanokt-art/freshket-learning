import Swal from 'sweetalert2'
import {
  ANNOUNCE_DESCRIPTION_MAX,
  ANNOUNCE_TITLE_MAX,
  COURSE_ADDED_PREFIX,
  COURSE_NEW_PREFIX,
  clampText,
} from '@/lib/notifications/courseAnnouncement'

// The dialog shown before a course is announced to Slack: the message as it will appear, with the
// title and description editable. Built from DOM nodes with textContent (never innerHTML) so
// nothing typed here can become markup.

export interface CourseAnnouncementDraft {
  title: string
  description: string
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

const FIELD = 'w-full px-3 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 bg-white'

/**
 * Resolves to the title and description to post, or null when the admin chooses not to announce.
 * The defaults are the course's own; the caller compares to know what was changed.
 */
export async function composeCourseAnnouncement(opts: {
  title: string
  description: string
  recipientCount: number
  isAddition?: boolean
}): Promise<CourseAnnouncementDraft | null> {
  const result = await Swal.fire({
    title: 'ประกาศลง Slack',
    showCancelButton: true,
    confirmButtonText: 'ส่งประกาศ',
    cancelButtonText: 'ไม่ประกาศ',
    confirmButtonColor: '#00ce7c',
    cancelButtonColor: '#94a3b8',
    reverseButtons: true,
    heightAuto: false,
    width: 560,
    customClass: {
      popup: 'rounded-2xl',
      title: 'text-base font-bold text-gray-900',
      confirmButton: 'rounded-xl px-5 py-2.5 text-sm font-bold',
      cancelButton: 'rounded-xl px-5 py-2.5 text-sm font-bold',
    },
    html: '<div id="fk-announce"></div>',
    didOpen: (popup) => {
      const root = popup.querySelector('#fk-announce')
      if (!root) return
      root.className = 'text-left space-y-3'

      const titleLabel = el('label', 'block text-xs font-bold text-gray-500 mb-1', 'ชื่อหลักสูตรที่แสดงในประกาศ')
      const titleInput = el('input', FIELD)
      titleInput.type = 'text'
      titleInput.id = 'fk-announce-title'
      titleInput.maxLength = ANNOUNCE_TITLE_MAX
      titleInput.value = opts.title

      const descLabel = el('label', 'block text-xs font-bold text-gray-500 mb-1', 'รายละเอียด (เว้นว่างเพื่อไม่แสดง)')
      const descInput = el('textarea', FIELD)
      descInput.id = 'fk-announce-description'
      descInput.rows = 3
      descInput.maxLength = ANNOUNCE_DESCRIPTION_MAX
      descInput.value = opts.description
      const counter = el('p', 'text-xs text-gray-400 mt-1 text-right')

      const previewLabel = el('p', 'text-xs font-bold text-gray-500 mb-1', 'ตัวอย่างข้อความใน Slack')
      const card = el('div', 'rounded-xl border border-gray-200 bg-white px-4 py-3 space-y-1.5')
      const headline = el('p', 'text-sm text-gray-900')
      const tag = el('span', 'bg-amber-100 text-amber-800 rounded px-1 mr-1', '@channel')
      const headPrefix = el('span')
      const headTitle = el('strong')
      const desc = el('p', 'text-sm text-gray-700 whitespace-pre-wrap')
      const audience = el('p', 'text-xs text-gray-400', 'ถึงผู้เรียน ' + opts.recipientCount + ' คน')
      const button = el('span', 'inline-block mt-1 text-xs font-bold text-gray-700 border border-gray-300 rounded-md px-2.5 py-1', 'ดูหลักสูตร')
      if (!opts.isAddition) headline.append(tag)
      headline.append(headPrefix, headTitle)
      headPrefix.textContent = opts.isAddition ? COURSE_ADDED_PREFIX : COURSE_NEW_PREFIX
      card.append(headline, desc, audience, button)

      const render = () => {
        headTitle.textContent = clampText(titleInput.value, ANNOUNCE_TITLE_MAX) || '(ยังไม่ได้ใส่ชื่อ)'
        const d = clampText(descInput.value, ANNOUNCE_DESCRIPTION_MAX)
        desc.textContent = d
        desc.style.display = d ? '' : 'none'
        counter.textContent = descInput.value.length + '/' + ANNOUNCE_DESCRIPTION_MAX
      }
      titleInput.addEventListener('input', render)
      descInput.addEventListener('input', render)
      render()

      const titleBox = el('div')
      titleBox.append(titleLabel, titleInput)
      const descBox = el('div')
      descBox.append(descLabel, descInput, counter)
      const previewBox = el('div')
      previewBox.append(previewLabel, card)
      root.append(titleBox, descBox, previewBox)
      titleInput.focus()
    },
    preConfirm: () => {
      const title = clampText((document.getElementById('fk-announce-title') as HTMLInputElement | null)?.value, ANNOUNCE_TITLE_MAX)
      const description = clampText((document.getElementById('fk-announce-description') as HTMLTextAreaElement | null)?.value, ANNOUNCE_DESCRIPTION_MAX)
      if (!title) {
        Swal.showValidationMessage('ใส่ชื่อหลักสูตรก่อนส่ง')
        return false
      }
      return { title, description }
    },
  })
  return result.isConfirmed && result.value ? (result.value as CourseAnnouncementDraft) : null
}
