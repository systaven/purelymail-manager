import { defineMessages } from '..';

export const dashboardMessages = defineMessages({
  en: {
    greeting: 'Overview', subtitle: 'Your PurelyMail account at a glance.', credit: 'Account credit', domains: 'Domains',
    mailboxes: 'Mailboxes', rules: 'Routing rules', quickActions: 'Quick actions', addDomain: 'Add a domain',
    addMailbox: 'Create a mailbox', addRule: 'Add a forwarding rule', openMail: 'Open mail', loadFailed: "Couldn't load the account overview.",
    dnsHealthy: '{n} of {total} domains pass all DNS checks',
  },
  'zh-CN': {
    greeting: '概览', subtitle: '一眼看清你的 PurelyMail 账户。', credit: '账户余额', domains: '域名',
    mailboxes: '邮箱', rules: '路由规则', quickActions: '快捷操作', addDomain: '添加域名',
    addMailbox: '创建邮箱', addRule: '添加转发规则', openMail: '打开邮件', loadFailed: '无法加载账户概览。',
    dnsHealthy: '{total} 个域名中有 {n} 个通过全部 DNS 检查',
  },
  'zh-TW': {
    greeting: '概覽', subtitle: '一眼看清你的 PurelyMail 帳戶。', credit: '帳戶餘額', domains: '網域',
    mailboxes: '信箱', rules: '路由規則', quickActions: '快捷操作', addDomain: '新增網域',
    addMailbox: '建立信箱', addRule: '新增轉寄規則', openMail: '開啟郵件', loadFailed: '無法載入帳戶概覽。',
    dnsHealthy: '{total} 個網域中有 {n} 個通過所有 DNS 檢查',
  },
  ja: {
    greeting: '概要', subtitle: 'PurelyMail アカウントをひと目で確認。', credit: 'アカウント残高', domains: 'ドメイン',
    mailboxes: 'メールボックス', rules: 'ルーティングルール', quickActions: 'クイック操作', addDomain: 'ドメインを追加',
    addMailbox: 'メールボックスを作成', addRule: '転送ルールを追加', openMail: 'メールを開く', loadFailed: 'アカウントの概要を読み込めませんでした。',
    dnsHealthy: '{total} 件中 {n} 件のドメインがすべての DNS チェックに合格',
  },
});
