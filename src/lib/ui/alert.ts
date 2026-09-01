import Swal, { type SweetAlertOptions } from 'sweetalert2'

// Replaces native window.alert / window.confirm.
//
// The browser dialogs were unstyled, showed the deployment hostname
// ("freshket-learning.vercel.app says…") above every message, and blocked the
// whole tab. This wraps SweetAlert2 with the Freshket look so a warning reads as
// part of the product instead of a browser artifact.
//
// Everything funnels through here rather than calling Swal directly at ~22 call
// sites, so the styling stays in one place and the call sites stay short.

// Design tokens (CLAUDE.md): freshket-500 #00ce7c is the brand/confirm colour,
// rose-500 for destructive, amber-500 for caution.
const BASE: SweetAlertOptions = {
  confirmButtonColor: '#00ce7c',
  cancelButtonColor: '#94a3b8',
  buttonsStyling: true,
  reverseButtons: true,
  heightAuto: false, // stops SweetAlert from adding padding to <body> and shifting layout
  customClass: {
    popup: 'rounded-2xl',
    title: 'text-base font-bold text-gray-900',
    htmlContainer: 'text-sm text-gray-600',
    confirmButton: 'rounded-xl px-5 py-2.5 text-sm font-bold',
    cancelButton: 'rounded-xl px-5 py-2.5 text-sm font-bold',
  },
}

export function alertSuccess(title: string, text?: string) {
  return Swal.fire({ ...BASE, icon: 'success', title, text, confirmButtonText: 'ตกลง' })
}

export function alertError(title: string, text?: string) {
  return Swal.fire({ ...BASE, icon: 'error', title, text, confirmButtonText: 'ตกลง' })
}

export function alertWarning(title: string, text?: string) {
  return Swal.fire({ ...BASE, icon: 'warning', title, text, confirmButtonText: 'ตกลง' })
}

export function alertInfo(title: string, text?: string) {
  return Swal.fire({ ...BASE, icon: 'info', title, text, confirmButtonText: 'ตกลง' })
}

/** Returns true only when the user actively confirms. */
export async function confirmAction(opts: {
  title: string
  text?: string
  confirmText?: string
  cancelText?: string
  danger?: boolean
}): Promise<boolean> {
  const res = await Swal.fire({
    ...BASE,
    icon: opts.danger ? 'warning' : 'question',
    title: opts.title,
    text: opts.text,
    showCancelButton: true,
    confirmButtonText: opts.confirmText ?? 'ยืนยัน',
    cancelButtonText: opts.cancelText ?? 'ยกเลิก',
    confirmButtonColor: opts.danger ? '#f43f5e' : '#00ce7c',
  })
  return res.isConfirmed
}

/** Brief corner toast — for outcomes that don't need to interrupt. */
export function toastSuccess(title: string) {
  return Swal.fire({
    toast: true,
    position: 'top-end',
    icon: 'success',
    title,
    showConfirmButton: false,
    timer: 2600,
    timerProgressBar: true,
    heightAuto: false,
    customClass: { popup: 'rounded-xl text-sm' },
  })
}
