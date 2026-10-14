export function createNotificationsController({ notificationsRepository }) {
  return {
    async list(req, res) {
      const [notifications, unreadCount] = await Promise.all([
        notificationsRepository.listForUser(req.user.id, req.validated.query),
        notificationsRepository.unreadCount(req.user.id),
      ]);
      res.json({ notifications, unreadCount });
    },

    async markAllRead(req, res) {
      const lastReadAt = await notificationsRepository.markAllRead(req.user.id);
      res.json({ unreadCount: 0, lastReadAt });
    },

    async activity(req, res) {
      res.json({
        activity: await notificationsRepository.recentOrderActivity(req.validated.query.limit),
      });
    },
  };
}
