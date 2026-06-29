export type NotifType =
  | 'shadow_pending_ack'   // team_lead / manager: someone submitted a shadow visit
  | 'shadow_ack_received'  // sale: your shadow visit was acknowledged
  | 'new_course'           // any role: a new course is published for you

export interface AppNotification {
  id: string
  type: NotifType
  title: string
  body: string
  read: boolean
  createdAt: Date
  refId: string    // shadowRecordId or courseId
  refPath: string  // '/shadow' or '/courses/{id}'
}
