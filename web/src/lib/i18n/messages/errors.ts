import { defineMessages } from '..';

// Server error codes (server/errors.ts ApiError `code`) in every language.
export const errorMessages = defineMessages({
  en: {
    network_error: 'Network error. Check your connection and try again.',
    internal_error: 'Something went wrong. Please try again.',
    unauthorized: 'Your session has ended. Please sign in again.',
    account_disabled: 'Your account has been disabled.',
    admins_only: 'Only administrators can do this.',
    purelymail_timeout: 'PurelyMail did not respond in time. Try again shortly.',
    purelymail_unreachable: "Couldn't reach PurelyMail.",
    purelymail_error: 'PurelyMail: {message}',
    not_found: 'Not found.',
  },
  'zh-CN': {
    network_error: '网络错误，请检查网络后重试。',
    internal_error: '出了点问题，请重试。',
    unauthorized: '登录已过期，请重新登录。',
    account_disabled: '你的账号已被停用。',
    admins_only: '只有管理员可以执行此操作。',
    purelymail_timeout: 'PurelyMail 响应超时，请稍后重试。',
    purelymail_unreachable: '无法连接到 PurelyMail。',
    purelymail_error: 'PurelyMail：{message}',
    not_found: '未找到。',
  },
  'zh-TW': {
    network_error: '網路錯誤，請檢查連線後再試。',
    internal_error: '發生問題，請再試一次。',
    unauthorized: '登入已過期，請重新登入。',
    account_disabled: '你的帳號已被停用。',
    admins_only: '只有管理員可以執行此操作。',
    purelymail_timeout: 'PurelyMail 回應逾時，請稍後再試。',
    purelymail_unreachable: '無法連線到 PurelyMail。',
    purelymail_error: 'PurelyMail：{message}',
    not_found: '找不到。',
  },
  ja: {
    network_error: 'ネットワークエラーです。接続を確認してもう一度お試しください。',
    internal_error: '問題が発生しました。もう一度お試しください。',
    unauthorized: 'セッションが終了しました。もう一度サインインしてください。',
    account_disabled: 'アカウントは無効化されています。',
    admins_only: 'この操作は管理者のみ実行できます。',
    purelymail_timeout: 'PurelyMail の応答がタイムアウトしました。しばらくしてからお試しください。',
    purelymail_unreachable: 'PurelyMail に接続できませんでした。',
    purelymail_error: 'PurelyMail：{message}',
    not_found: '見つかりません。',
  },
});
