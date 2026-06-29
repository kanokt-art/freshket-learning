import { type Resource, RESOURCE_TYPE_LABELS } from '@/types/course'
import { formatDate } from '@/lib/utils/dateFormatter'

interface ResourceCardProps {
  resource: Resource
}

const TYPE_ICONS: Record<string, string> = {
  pdf:      '📄',
  video:    '🎬',
  link:     '🔗',
  document: '📝',
  playbook: '📋',
  sop:      '⚙️',
}

const TYPE_COLORS: Record<string, string> = {
  pdf:      'bg-red-50 text-red-700',
  video:    'bg-purple-50 text-purple-700',
  link:     'bg-blue-50 text-blue-700',
  document: 'bg-yellow-50 text-yellow-700',
  playbook: 'bg-brand-green-50 text-brand-green',
  sop:      'bg-orange-50 text-orange-700',
}

export function ResourceCard({ resource }: ResourceCardProps) {
  return (
    <a
      href={resource.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-card hover:shadow-card-hover hover:border-brand-green-100 transition-all"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-2xl">{TYPE_ICONS[resource.type] ?? '📎'}</span>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-normal ${TYPE_COLORS[resource.type] ?? 'bg-gray-100 text-gray-600'}`}
        >
          {RESOURCE_TYPE_LABELS[resource.type] ?? resource.type}
        </span>
      </div>

      <div className="flex-1">
        <h3 className="text-sm font-bold text-brand-dark group-hover:text-brand-green line-clamp-2 transition-colors">
          {resource.title}
        </h3>
        {resource.description && (
          <p className="mt-1 text-xs text-brand-muted line-clamp-2">{resource.description}</p>
        )}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-gray-50">
        <div className="flex flex-wrap gap-1">
          {resource.tags.slice(0, 2).map((tag) => (
            <span key={tag} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-brand-muted">
              {tag}
            </span>
          ))}
        </div>
        <span className="text-xs text-gray-400">{formatDate(resource.createdAt)}</span>
      </div>
    </a>
  )
}
