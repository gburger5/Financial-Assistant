import './DataTable.css'

export interface Column<T = Record<string, unknown>> {
  key: string
  header: string
  render?: (value: unknown, row: T) => React.ReactNode
}

interface DataTableProps<T extends Record<string, unknown>> {
  columns: Column<T>[]
  data: T[]
  onRowClick?: (row: T) => void
}

export default function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  onRowClick,
}: DataTableProps<T>) {
  return (
    <div className="data-table-wrapper">
      <table className="data-table">
        <thead className="data-table__head">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className="data-table__th">
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr
              key={i}
              className={['data-table__row', onRowClick ? 'data-table__row--clickable' : '']
                .filter(Boolean)
                .join(' ')}
              onClick={() => onRowClick?.(row)}
            >
              {columns.map((col) => (
                <td key={col.key} className="data-table__td">
                  {col.render ? col.render(row[col.key], row) : String(row[col.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
