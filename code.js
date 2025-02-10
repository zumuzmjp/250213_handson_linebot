// 定数定義
const CHANNEL_ACCESS_TOKEN = 'YOUR_LONG_TERM_TOKEN_HERE';
const SHEET_NAME = 'Items';

/**
 * Webhookを受け取る関数
 */
function doPost(e) {
  const json = JSON.parse(e.postData.contents);
  const event = json.events[0];
  
  // メッセージイベント以外は無視
  if (event.type !== 'message' || event.message.type !== 'text') {
    return ContentService.createTextOutput(JSON.stringify({'status': 'not message'}))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const userMessage = event.message.text;
  const userId = event.source.userId;
  const replyToken = event.replyToken;

  // ユーザーの現在の状態を取得
  const userState = getUserState(userId);

  try {
    if (userState === 'ADDING_ITEM') {
      handleAddItem(userId, userMessage, replyToken);
    } else {
      if (userMessage === '在庫追加') {
        setUserState(userId, 'ADDING_ITEM');
        replyMessage(replyToken, 'アイテム名と個数を入力してください（例: トイレットペーパー 2個）\n\n※キャンセルする場合は「キャンセル」と入力してください');
      } else if (userMessage.endsWith('使いました')) {
        handleUseItem(userMessage, replyToken);
      } else if (isStockCheckQuery(userMessage)) {
        handleStockCheck(userMessage, replyToken);
      } else if (userMessage === '在庫確認方法') {
        replyMessage(replyToken, '在庫を確認したいアイテムについて、以下のような形式で質問してください：\n\n・トイレットペーパーあと何個？\n・ティッシュは後何個？\n・洗剤って残り何個？');
      } else if (userMessage === '使用報告方法') {
        replyMessage(replyToken, 'アイテムを使用した場合は、以下のような形式で報告してください：\n\n例：トイレットペーパー使いました');
      } else if (userMessage === '在庫一覧') {
        handleStockList(replyToken);
      } else {
        replyMessage(replyToken, '下のメニューから操作を選択するか、以下の形式で入力してください：\n\n1️⃣ 在庫追加\n2️⃣ アイテム名あと何個？\n3️⃣ アイテム名使いました\n4️⃣ 在庫一覧');
      }
    }
  } catch (error) {
    replyMessage(replyToken, 'エラーが発生しました: ' + error.message);
  }

  return ContentService.createTextOutput(JSON.stringify({'status': 'ok'}))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * アイテム追加処理
 */
function handleAddItem(userId, message, replyToken) {
  // キャンセル処理を追加
  if (message === 'キャンセル') {
    setUserState(userId, 'NONE');
    replyMessage(replyToken, '在庫追加をキャンセルしました。');
    return;
  }

  const addItemRegex = /^(.+)\s+(\d+)個$/;
  const match = message.match(addItemRegex);

  if (!match) {
    replyMessage(replyToken, 'アイテム名と個数を正しい形式で入力してください（例: トイレットペーパー 2個）\n\n※キャンセルする場合は「キャンセル」と入力してください');
    return;
  }

  const itemName = match[1].trim();
  const itemCount = parseInt(match[2], 10);

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();

  let foundRow = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === itemName) {
      foundRow = i + 1;
      break;
    }
  }

  if (foundRow === -1) {
    sheet.appendRow([itemName, itemCount]);
  } else {
    const currentCount = Number(sheet.getRange(foundRow, 2).getValue());
    sheet.getRange(foundRow, 2).setValue(currentCount + itemCount);
  }

  setUserState(userId, 'NONE');
  replyMessage(replyToken, `${itemName}を${itemCount}個追加しました。`);
}

/**
 * アイテム使用処理
 */
function handleUseItem(message, replyToken) {
  const itemName = message.replace('使いました', '').trim();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();

  let foundRow = -1;
  let currentCount = 0;

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === itemName) {
      foundRow = i + 1;
      currentCount = Number(data[i][1]);
      break;
    }
  }

  if (foundRow === -1) {
    replyMessage(replyToken, `${itemName}は登録されていません。`);
    return;
  }

  if (currentCount <= 0) {
    replyMessage(replyToken, `${itemName}は在庫がありません。`);
    return;
  }

  sheet.getRange(foundRow, 2).setValue(currentCount - 1);
  replyMessage(replyToken, `${itemName}の在庫数は残り${currentCount - 1}個です。`);
}

/**
 * ユーザー状態管理
 */
function getUserState(userId) {
  const userStateKey = 'userState_' + userId;
  const state = PropertiesService.getScriptProperties().getProperty(userStateKey);
  return state || 'NONE';
}

function setUserState(userId, state) {
  const userStateKey = 'userState_' + userId;
  PropertiesService.getScriptProperties().setProperty(userStateKey, state);
}

/**
 * LINE Messaging API関連
 */
function replyMessage(replyToken, text) {
  const url = 'https://api.line.me/v2/bot/message/reply';
  
  // クイックリプライの定義を分離
  const quickReplyItems = {
    items: [
      {
        type: 'action',
        action: {
          type: 'message',
          label: '在庫追加',
          text: '在庫追加'
        }
      },
      {
        type: 'action',
        action: {
          type: 'message',
          label: '在庫確認',
          text: '在庫確認方法'
        }
      },
      {
        type: 'action',
        action: {
          type: 'message',
          label: '使用報告',
          text: '使用報告方法'
        }
      },
      {
        type: 'action',
        action: {
          type: 'message',
          label: '在庫一覧',
          text: '在庫一覧'
        }
      }
    ]
  };

  const payload = {
    replyToken: replyToken,
    messages: [
      {
        type: 'text',
        text: text,
        quickReply: quickReplyItems
      }
    ]
  };

  const options = {
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + CHANNEL_ACCESS_TOKEN
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true  // エラーを詳細に確認するため追加
  };

  const response = UrlFetchApp.fetch(url, options);
  
  // エラーログ追加（デバッグ用）
  console.log('LINE API Response:', response.getContentText());
}

/**
 * 在庫確認クエリかどうかを判定
 */
function isStockCheckQuery(message) {
  const patterns = [
    /(.+)は後何個\??/,
    /(.+)は後なんこ\??/,
    /(.+)後何個\??/,
    /(.+)後なんこ\??/,
    /(.+)って後何個\??/,
    /(.+)ってあとなんこ\??/,
    /(.+)あと何個\??/,
    /(.+)あとなんこ\??/,
    /(.+)残り[はって]*[何なん]+個\??/
  ];
  
  return patterns.some(pattern => pattern.test(message));
}

/**
 * アイテム名を抽出
 */
function extractItemName(message) {
  const patterns = [
    /(.+)は後何個\??/,
    /(.+)は後なんこ\??/,
    /(.+)後何個\??/,
    /(.+)後なんこ\??/,
    /(.+)って後何個\??/,
    /(.+)ってあとなんこ\??/,
    /(.+)あと何個\??/,
    /(.+)あとなんこ\??/,
    /(.+)残り[はって]*[何なん]+個\??/
  ];
  
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }
  return null;
}

/**
 * 在庫確認処理
 */
function handleStockCheck(message, replyToken) {
  const itemName = extractItemName(message);
  if (!itemName) {
    replyMessage(replyToken, '申し訳ありません。アイテム名を認識できませんでした。');
    return;
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();

  let foundRow = -1;
  let currentCount = 0;

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === itemName) {
      foundRow = i + 1;
      currentCount = Number(data[i][1]);
      break;
    }
  }

  if (foundRow === -1) {
    replyMessage(replyToken, `${itemName}は登録されていません。`);
    return;
  }

  // 在庫状況に応じてメッセージを変える
  let responseMessage;
  if (currentCount <= 0) {
    responseMessage = `${itemName}は在庫切れです。`;
  } else if (currentCount <= 2) {
    responseMessage = `${itemName}の在庫は残り${currentCount}個です。在庫が少なくなっています。`;
  } else {
    responseMessage = `${itemName}の在庫は残り${currentCount}個です。`;
  }

  replyMessage(replyToken, responseMessage);
}

/**
 * リッチメニューを作成・設定する関数
 */
function createRichMenu() {
  const url = 'https://api.line.me/v2/bot/richmenu';
  
  const richMenu = {
    size: {
      width: 2500,
      height: 843
    },
    selected: true,
    name: "在庫管理メニュー",
    chatBarText: "メニューを開く",
    areas: [
      {
        bounds: {
          x: 0,
          y: 0,
          width: 625,  // 幅を4分割に調整
          height: 843
        },
        action: {
          type: "text",
          text: "在庫追加"
        }
      },
      {
        bounds: {
          x: 625,
          y: 0,
          width: 625,
          height: 843
        },
        action: {
          type: "text",
          text: "在庫確認方法"
        }
      },
      {
        bounds: {
          x: 1250,
          y: 0,
          width: 625,
          height: 843
        },
        action: {
          type: "text",
          text: "使用報告方法"
        }
      },
      {
        bounds: {
          x: 1875,
          y: 0,
          width: 625,
          height: 843
        },
        action: {
          type: "text",
          text: "在庫一覧"
        }
      }
    ]
  };

  const options = {
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + CHANNEL_ACCESS_TOKEN
    },
    payload: JSON.stringify(richMenu)
  };

  const response = UrlFetchApp.fetch(url, options);
  const richMenuId = JSON.parse(response.getContentText()).richMenuId;
  
  // リッチメニューをデフォルトとして設定
  setDefaultRichMenu(richMenuId);
  
  return richMenuId;
}

/**
 * リッチメニューをデフォルトとして設定する関数
 */
function setDefaultRichMenu(richMenuId) {
  const url = `https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`;
  
  const options = {
    method: 'post',
    headers: {
      'Authorization': 'Bearer ' + CHANNEL_ACCESS_TOKEN
    }
  };

  UrlFetchApp.fetch(url, options);
}

/**
 * リッチメニュー画像をアップロードする関数
 */
function uploadRichMenuImage(richMenuId, imageUrl) {
  // 画像をバイナリデータとして取得
  const response = UrlFetchApp.fetch(imageUrl);
  const imageBlob = response.getBlob();
  
  const url = `https://api.line.me/v2/bot/richmenu/${richMenuId}/content`;
  
  const options = {
    method: 'post',
    headers: {
      'Content-Type': 'image/jpeg',  // または 'image/png'
      'Authorization': 'Bearer ' + CHANNEL_ACCESS_TOKEN
    },
    payload: imageBlob
  };

  return UrlFetchApp.fetch(url, options);
}

/**
 * リッチメニューの作成から画像アップロード、設定までを一括で行う関数
 */
function setupCompleteRichMenu() {
  // 1. リッチメニューを作成
  const richMenuId = createRichMenu();
  
  // 2. リッチメニュー画像をアップロード
  // 画像URLは実際に使用する画像のURLに置き換えてください
  const imageUrl = 'https://example.com/path/to/your/richmenu-image.jpg';
  uploadRichMenuImage(richMenuId, imageUrl);
  
  // 3. デフォルトのリッチメニューとして設定
  setDefaultRichMenu(richMenuId);
  
  return richMenuId;
}

/**
 * 既存のリッチメニューを削除する関数
 */
function deleteRichMenu(richMenuId) {
  const url = `https://api.line.me/v2/bot/richmenu/${richMenuId}`;
  
  const options = {
    method: 'delete',
    headers: {
      'Authorization': 'Bearer ' + CHANNEL_ACCESS_TOKEN
    }
  };

  return UrlFetchApp.fetch(url, options);
}

/**
 * 既存のリッチメニューをすべて取得する関数
 */
function getRichMenuList() {
  const url = 'https://api.line.me/v2/bot/richmenu/list';
  
  const options = {
    method: 'get',
    headers: {
      'Authorization': 'Bearer ' + CHANNEL_ACCESS_TOKEN
    }
  };

  const response = UrlFetchApp.fetch(url, options);
  return JSON.parse(response.getContentText());
}

/**
 * 在庫一覧を表示する関数を追加
 */
function handleStockList(replyToken) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  
  if (data.length <= 1) {
    replyMessage(replyToken, '登録されているアイテムはありません。');
    return;
  }

  let message = '【在庫一覧】\n\n';
  for (let i = 1; i < data.length; i++) {
    const itemName = data[i][0];
    const count = data[i][1];
    const status = count <= 0 ? '【在庫切れ】' : 
                  count <= 2 ? '【残りわずか】' : '';
    message += `${itemName}: ${count}個 ${status}\n`;
  }

  replyMessage(replyToken, message);
}
