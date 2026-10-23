export type NotifType =
  | 'shadow_pending_ack'      // team_lead / manager: someone submitted a shadow visit
  | 'shadow_ack_received'     // sale: your shadow visit was acknowledged
  | 'new_course'              // any role: a new course is published for you
  | 'heart_received'          // any role: a colleague sent you a heart (ส่งใจ)
  | 'assessment_completed'    // team_lead / manager: someone on your team finished an assessment
  | 'new_mandatory'           // any role: a new Mandatory Reading slide is published for your department

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
