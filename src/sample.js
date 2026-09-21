export const sample = `{
  "catalog": { //播客节目目录
    "title": "Signals After Sundown", //节目标题
    "edition": "demo-2026.1", //示例目录版本
    "generatedFor": "offline-preview", //生成用途
    "settings": {
      "language": "zh-CN", //界面语言
      "autoDownload": false //自动下载开关
    },
    "episodes": [{ //剧集列表
      "id": "ep-aurora-001",              //虚构剧集标识
"title": "The Clockmaker's Balcony", //虚构剧集标题
      "durationSeconds": 1842, //节目时长：秒
      "publishedAt": "2026-03-14T08:30:00Z", //虚构发布时间
      "tags": ["fiction", "night-walk"], //内容标签
      "playback": { //播放进度
  "positionSeconds": 486, //当前位置：秒
        "completed": false                   //是否已播完
  },
      "artwork": {
        "colors": ["#243B53", "#F6C177"] //封面主色
      },
      "license": "CC-BY-4.0", //示例授权标记
      "lastSyncedAt": "2026-03-15T09:00:00Z", //虚构同步时间
      "notes": "All names and content are fictional." //示例说明
    }]
  } //目录结束
}`;
