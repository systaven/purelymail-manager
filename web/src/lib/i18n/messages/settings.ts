import { defineMessages } from '..';

// Settings page: activity log (more settings arrive with the members milestone).
export const settingsMessages = defineMessages({
  en: {
    title: 'Settings', description: 'Activity and configuration for this panel.', activity: 'Activity',
    activityHint: 'Every change made through this panel, newest first.', noActivity: 'Nothing has happened yet.',
    loadMore: 'Load more', filter: 'Filter by person, action or target', when: 'When', who: 'Who', what: 'What',
    'auth.login': 'Signed in', 'domain.add': 'Added domain', 'domain.update': 'Changed domain settings', 'domain.delete': 'Deleted domain',
    'mailbox.create': 'Created mailbox', 'mailbox.update': 'Changed mailbox', 'mailbox.delete': 'Deleted mailbox',
    'mailbox.recovery.set': 'Set a recovery method', 'mailbox.recovery.delete': 'Removed a recovery method',
    'mailbox.app_password.create': 'Created an app password',
    'routing.create': 'Created routing rule', 'routing.update': 'Changed routing rule', 'routing.delete': 'Deleted routing rule',
  },
  'zh-CN': {
    title: '设置', description: '此面板的操作记录与配置。', activity: '操作记录',
    activityHint: '通过此面板进行的所有更改，最新的在前。', noActivity: '还没有任何操作。',
    loadMore: '加载更多', filter: '按人员、操作或对象筛选', when: '时间', who: '操作人', what: '操作',
    'auth.login': '登录', 'domain.add': '添加了域名', 'domain.update': '修改了域名设置', 'domain.delete': '删除了域名',
    'mailbox.create': '创建了邮箱', 'mailbox.update': '修改了邮箱', 'mailbox.delete': '删除了邮箱',
    'mailbox.recovery.set': '设置了找回方式', 'mailbox.recovery.delete': '移除了找回方式',
    'mailbox.app_password.create': '创建了应用密码',
    'routing.create': '创建了路由规则', 'routing.update': '修改了路由规则', 'routing.delete': '删除了路由规则',
  },
  'zh-TW': {
    title: '設定', description: '此面板的操作紀錄與設定。', activity: '操作紀錄',
    activityHint: '透過此面板進行的所有變更，最新的在前。', noActivity: '還沒有任何操作。',
    loadMore: '載入更多', filter: '依人員、操作或對象篩選', when: '時間', who: '操作人', what: '操作',
    'auth.login': '登入', 'domain.add': '新增了網域', 'domain.update': '變更了網域設定', 'domain.delete': '刪除了網域',
    'mailbox.create': '建立了信箱', 'mailbox.update': '變更了信箱', 'mailbox.delete': '刪除了信箱',
    'mailbox.recovery.set': '設定了備援方式', 'mailbox.recovery.delete': '移除了備援方式',
    'mailbox.app_password.create': '建立了應用程式密碼',
    'routing.create': '建立了路由規則', 'routing.update': '變更了路由規則', 'routing.delete': '刪除了路由規則',
  },
  ja: {
    title: '設定', description: 'このパネルのアクティビティと設定。', activity: 'アクティビティ',
    activityHint: 'このパネルで行われたすべての変更（新しい順）。', noActivity: 'まだ何も行われていません。',
    loadMore: 'さらに読み込む', filter: '人、操作、対象で絞り込み', when: '日時', who: '実行者', what: '内容',
    'auth.login': 'サインイン', 'domain.add': 'ドメインを追加', 'domain.update': 'ドメイン設定を変更', 'domain.delete': 'ドメインを削除',
    'mailbox.create': 'メールボックスを作成', 'mailbox.update': 'メールボックスを変更', 'mailbox.delete': 'メールボックスを削除',
    'mailbox.recovery.set': '復旧方法を設定', 'mailbox.recovery.delete': '復旧方法を削除',
    'mailbox.app_password.create': 'アプリパスワードを作成',
    'routing.create': 'ルーティングルールを作成', 'routing.update': 'ルーティングルールを変更', 'routing.delete': 'ルーティングルールを削除',
  },
});
