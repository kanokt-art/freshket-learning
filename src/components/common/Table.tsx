import { type ReactNode } from 'react'

export const Table = ({ children }: { children: ReactNode }) => (
  <div className="w-full overflow-x-auto rounded-2xl border border-gray-100 bg-white">
    <table className="w-full border-collapse text-sm text-gray-900">
      {children}
    </table>
  </div>
)
Table.displayName = 'Table'

const Colgroup = ({ children }: { children: ReactNode }) => (
  <colgroup>{children}</colgroup>
)
Colgroup.displayName = 'Table.Colgroup'
Table.Colgroup = Colgroup

const Col = ({ className }: { className?: string }) => (
  <col className={className} />
)
Col.displayName = 'Table.Col'
Table.Col = Col

const Header = ({ children }: { children: ReactNode }) => (
  <thead className="bg-white border-b border-gray-100">{children}</thead>
)
Header.displayName = 'Table.Header'
Table.Header = Header

const Body = ({
  children,
  striped,
  interactive,
}: {
  children: ReactNode
  striped?: boolean
  interactive?: boolean
}) => (
  <>
    <tbody className="table-row h-3" />
    <tbody
      className={[
        striped ? '[&_tr:nth-child(odd)]:bg-slate-50' : '',
        interactive ? '[&_tr:hover]:bg-freshket-100/40' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </tbody>
  </>
)
Body.displayName = 'Table.Body'
Table.Body = Body

const Row = ({ children }: { children: ReactNode }) => (
  <tr className="[&_td:first-child]:rounded-l [&_td:last-child]:rounded-r transition-colors">
    {children}
  </tr>
)
Row.displayName = 'Table.Row'
Table.Row = Row

const Head = ({ children }: { children: ReactNode }) => (
  <th className="h-10 px-4 align-middle font-bold text-xs text-gray-500 text-left last:text-right whitespace-nowrap">
    {children}
  </th>
)
Head.displayName = 'Table.Head'
Table.Head = Head

const Cell = ({
  children,
  className,
  colSpan,
}: {
  children: ReactNode
  className?: string
  colSpan?: number
}) => (
  <td
    className={`px-4 py-3 align-middle last:text-right ${className ?? ''}`}
    colSpan={colSpan}
  >
    {children}
  </td>
)
Cell.displayName = 'Table.Cell'
Table.Cell = Cell

const Footer = ({ children }: { children: ReactNode }) => (
  <tfoot className="border-t border-gray-100">{children}</tfoot>
)
Footer.displayName = 'Table.Footer'
Table.Footer = Footer
