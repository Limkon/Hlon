// public/app.js (或者 public/locales/zh.js)

const translationsZH = {
    // 页面标题和主要标题
    "pageTitle": "简易脚本运行器",
    "mainHeading": "简易脚本运行器",

    // 脚本管理部分
    "manageScriptsTitle": "管理脚本",
    "editScriptIdLabel": "", // Hidden input, no label needed usually
    "scriptNameLabel": "脚本名称：",
    "scriptTypeLabel": "脚本类型：",
    "scriptContentLabel": "脚本内容：",
    "addScriptButton": "添加脚本",
    "updateScriptButton": "更新脚本",
    "cancelEditButton": "取消编辑",
    "existingScriptsTitle": "现有脚本",
    "runScriptButton": "运行",
    "editScriptButton": "编辑",
    "deleteScriptButton": "删除",
    "jsTypeOption": "JavaScript (.js)",
    "shTypeOption": "Shell 脚本 (.sh)",


    // 任务管理部分
    "manageTasksTitle": "管理定时任务",
    "selectScriptToScheduleLabel": "选择要调度的脚本：",
    "selectScriptPlaceholder": "-- 选择脚本 --",
    "cronExpressionLabel": "Cron 表达式 (例如：`* * * * *` 表示每分钟)：",
    "cronExpressionPlaceholder": "* * * * *",
    "cronHelpLink": "需要帮助？",
    "addScheduledTaskButton": "添加定时任务",
    "scheduledTasksTitle": "定时任务列表",
    "deleteTaskButton": "删除任务",

    // 输出/日志部分
    "outputAreaTitle": "脚本输出 / 日志",
    "outputAreaPlaceholder": "输出将显示在此处...",

    // 动态消息 (可以包含占位符 {{placeholder}})
    "errorFetchingScripts": "获取脚本列表失败：{{message}}",
    "errorSavingScript": "保存脚本失败：{{message}}",
    "scriptAdded": "脚本已添加：{{name}}",
    "scriptUpdated": "脚本已更新：{{name}}",
    "confirmDeleteScript": "您确定要删除此脚本及其关联的定时任务吗？",
    "scriptDeleted": "{{message}}", // server message for script deletion
    "errorDeletingScript": "删除脚本失败：{{message}}",
    "errorFetchingScriptContent": "获取脚本内容失败：{{message}}",
    "runningScript": "正在运行脚本 {{scriptId}}...",
    "errorRunningScript": "运行脚本失败：{{message}}",
    "taskScheduled": "已为脚本 {{scriptName}} 调度任务。",
    "errorSchedulingTask": "调度任务失败：{{message}}",
    "confirmDeleteTask": "您确定要删除此定时任务吗？",
    "taskDeleted": "{{message}}", // server message for task deletion
    "errorDeletingTask": "删除任务失败：{{message}}",
    "pleaseSelectScript": "请选择一个脚本。"
};

// 如果您创建了单独的 locales/zh.js，请确保在 index.html 中 app.js 之前引入它
// <script src="locales/zh.js"></script>
