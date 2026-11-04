import { defineMessages } from '..';

// Words used all over the app.
export const commonMessages = defineMessages({
  en: {
    save: 'Save', cancel: 'Cancel', delete: 'Delete', close: 'Close', refresh: 'Refresh', retry: 'Try again',
    loading: 'Loading…', search: 'Search', back: 'Back', comingSoon: 'Coming soon',
    comingSoonBody: 'This part of the app is being built. It will arrive in an upcoming release.',
  },
  'zh-CN': {
    save: '保存', cancel: '取消', delete: '删除', close: '关闭', refresh: '刷新', retry: '重试',
    loading: '加载中…', search: '搜索', back: '返回', comingSoon: '即将推出',
    comingSoonBody: '这部分功能正在开发中，会在后续版本中上线。',
  },
  'zh-TW': {
    save: '儲存', cancel: '取消', delete: '刪除', close: '關閉', refresh: '重新整理', retry: '重試',
    loading: '載入中…', search: '搜尋', back: '返回', comingSoon: '即將推出',
    comingSoonBody: '這部分功能正在開發中，會在後續版本中推出。',
  },
  ja: {
    save: '保存', cancel: 'キャンセル', delete: '削除', close: '閉じる', refresh: '更新', retry: '再試行',
    loading: '読み込み中…', search: '検索', back: '戻る', comingSoon: '近日公開',
    comingSoonBody: 'この機能は現在開発中です。今後のリリースで追加されます。',
  },
});
