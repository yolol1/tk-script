// ==UserScript==
// @name         Twitter/X 纯本地规则拉黑机器人 (零延迟升级版)
// @namespace    http://tampermonkey.net/
// @version      7.4
// @description  使用本地正则规则判定并拉黑推特黄推和引流号，优化单字伪装表情刷屏检测，增强机器ID交叉验证。
// @author       You
// @match        *://x.com/*
// @match        *://twitter.com/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // --------------------------------------------------------
  // 全局配置与常量
  // --------------------------------------------------------
  const CONFIG = {
    BEARER_TOKEN: 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
    MIN_BLOCK_DELAY: 800,
    MAX_BLOCK_DELAY: 1500
  };

  // --------------------------------------------------------
  // 1. 自定义 UI 系统 
  // --------------------------------------------------------
  class ToastManager {
    constructor() {
      this.container = document.createElement('div');
      this.container.style.cssText = `
                position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
                z-index: 10000; display: flex; flex-direction: column; gap: 10px;
                pointer-events: none;
            `;
      document.body.appendChild(this.container);
    }

    show(message, type = 'info', duration = 3000) {
      const toast = document.createElement('div');
      const bgColors = {
        'success': '#00ba7c',
        'error': '#f4212e',
        'info': '#1d9bf0',
        'warning': '#ffd400'
      };
      toast.style.cssText = `
                background: ${bgColors[type] || bgColors['info']}; color: ${type === 'warning' ? '#000' : '#fff'};
                padding: 12px 24px; border-radius: 9999px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto;
                font-size: 15px; font-weight: 700; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                opacity: 0; transform: translateY(-20px); transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
            `;
      toast.innerText = message;
      this.container.appendChild(toast);

      requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
      });

      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-20px)';
        setTimeout(() => toast.remove(), 300);
      }, duration);
    }
  }

  const Toaster = new ToastManager();

  // --------------------------------------------------------
  // 2. 核心网络通信
  // --------------------------------------------------------
  class TwitterAPI {
    static getCookie(name) {
      const value = `; ${document.cookie}`;
      const parts = value.split(`; ${name}=`);
      if (parts.length === 2) return parts.pop().split(';').shift();
      return '';
    }

    static async blockUser(screenName) {
      const ct0 = this.getCookie("ct0");
      if (!ct0) {
        console.error("找不到 ct0 Cookie，无法执行拉黑");
        return false;
      }

      try {
        const response = await fetch("https://x.com/i/api/1.1/blocks/create.json", {
          method: "POST",
          headers: {
            "authorization": `Bearer ${CONFIG.BEARER_TOKEN}`,
            "x-csrf-token": ct0,
            "content-type": "application/x-www-form-urlencoded",
          },
          body: `screen_name=${screenName}`
        });
        return response.ok;
      } catch (e) {
        console.error(`拉黑 ${screenName} 请求异常:`, e);
        return false;
      }
    }
  }

  // --------------------------------------------------------
  // 3. 本地判定规则引擎
  // --------------------------------------------------------
  class LocalRuleEngine {
    static isBot(userNameContent, screenName, textContent) {
      const trimmedText = textContent.trim();

      // ==========================================
      // 规则 1：高危账号名称拦截
      // ==========================================
      // 直接测试包含名字和ID的完整元素文本，防止过长名字被DOM截断导致漏判
      const nameSpamRegex = /(?:点(?:击)?|看)(?:主页|头像|置顶)|主页自取|进群选人|资源(?:入口)?|找炮友|固炮|约(?:炮|泡|萢|拍|跑|p|P|见|妹)|破处|裸聊|福利姬|母狗|找主人|真实可靠|门槛|同城|全城|面付|外围|空降|品茶|修车|留[联连]系|原味|探花|楼凤|伴游|互粉|互关|互fo|fo back|秒回|赌场|澳门|娱乐城|百家乐|[加➕][Vv微威]|vx|威信|Q群|TG群|全国[1-9]线|附近(?:好友|真实)|无偿|处男|chu男|免费破|24h/i;
      if (nameSpamRegex.test(userNameContent)) {
        return true;
      }

      if (trimmedText.length > 0) {
        // ==========================================
        // 规则 2：高危正文内容拦截
        // ==========================================
        const textSpamRegex = /主页有惊喜|看我主页|看主页|看置顶|加[Vv微信]{1,2}看|门槛.*[红包|付费]|全网最[低全]|同城|全城|固炮|约(?:炮|泡|萢|拍|跑|p|P)|裸聊|福利姬|涩播|🔞|💦/i;
        if (textSpamRegex.test(trimmedText)) {
          return true;
        }

        // ==========================================
        // 规则 3：纯链接/短链接引流机器
        // ==========================================
        const urlRegex = /(?:https?:\/\/|www\.|t\.co\/)[^\s]+/gi;
        if (urlRegex.test(trimmedText)) {
          const textWithoutUrl = trimmedText.replace(urlRegex, '').trim();
          const strippedWithoutUrl = textWithoutUrl.replace(/[\s\p{Z}\p{Cf}\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Symbol}\p{Punctuation}]/gu, '');
          if (strippedWithoutUrl.length <= 3) {
            return true;
          }
        }

        // ==========================================
        // 规则 4：单字伪装与多行表情刷屏综合检测
        // ==========================================
        // 提取纯文字（去除非人类语言的符号、表情、标点、特殊空白）
        const pureText = trimmedText.replace(/[\s\p{Z}\p{C}\p{M}\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Emoji}\p{Symbol}\p{Punctuation}]/gu, '');
        const hasEmoji = /[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Emoji}]/u.test(trimmedText);

        // 提取账号机器批量注册特征：较长的英文字母/下划线组合，结尾紧跟 4~8 位纯数字
        const isBotHandlePattern = /[a-zA-Z_]{5,}\d{4,8}$/.test(screenName);

        // 如果正文里的“有效汉字/字母”极少 (<=2个)，说明它主要是在发符号或表情
        if (pureText.length <= 2) {
          // 情况 A: 包含数字 (如 🌹2🌸)
          if (/\d/.test(trimmedText)) return true;

          // 情况 B: 垂直多行刷屏占位 (如 🔀\n🌼\n💜🈶\n💓)
          const lines = trimmedText.split(/\r\n|\r|\n/);
          const nonEmptyLines = lines.filter(line => line.trim().length > 0).length;
          // 如果跨越3个非空行，或者总行数超过4行，且含有表情
          if (hasEmoji && (lines.length >= 4 || nonEmptyLines >= 3)) return true;

          // 情况 C: 机器账号特征交叉验证 (只要是批量ID，且没什么有效字数，直接拉黑)
          if (isBotHandlePattern) return true;
        }

        // ==========================================
        // 规则 5：乱码+表情 防屏蔽变种 (如 "K 14 n 🌸")
        // ==========================================
        if (pureText.length > 0 && pureText.length <= 4) {
          const hasCJK = /[\u4e00-\u9fa5]/.test(pureText);
          if (!hasCJK && hasEmoji) {
            return true;
          }
        }
      }

      return false;
    }
  }

  // --------------------------------------------------------
  // 4. 核心业务逻辑与任务队列
  // --------------------------------------------------------
  class BotBlockerApp {
    constructor() {
      // 加载本地存储的队列，防止刷新页面导致未拉黑的任务丢失
      this.blockQueue = this.loadQueue();
      this.isQueueRunning = false;

      // 注入用于彻底隐藏元素的全局CSS
      const style = document.createElement('style');
      style.innerHTML = '.bot-blocker-hidden { display: none !important; }';
      document.head.appendChild(style);

      this.initUI();

      // 启动如果有遗留任务，继续执行
      if (this.blockQueue.length > 0) this.processQueue();

      // 改为全自动后台扫描，每 1.5 秒执行一次，不再需要用户手动点击
      setInterval(() => this.scanAndAnalyze(), 1500);
    }

    loadQueue() {
      try {
        return JSON.parse(localStorage.getItem('botBlockQueue') || '[]');
      } catch (e) {
        return [];
      }
    }

    saveQueue() {
      localStorage.setItem('botBlockQueue', JSON.stringify(this.blockQueue));
    }

    sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    async processQueue() {
      if (this.isQueueRunning) return;
      this.isQueueRunning = true;

      while (this.blockQueue.length > 0) {
        this.updateUI();
        const handle = this.blockQueue[0];

        await TwitterAPI.blockUser(handle);

        // 无论成功失败，尝试后即移出队列并保存状态
        this.blockQueue.shift();
        this.saveQueue();

        const delay = Math.floor(Math.random() * (CONFIG.MAX_BLOCK_DELAY - CONFIG.MIN_BLOCK_DELAY)) + CONFIG.MIN_BLOCK_DELAY;
        await this.sleep(delay);
      }

      this.isQueueRunning = false;
      this.updateUI();
    }

    scanAndAnalyze() {
      const tweets = document.querySelectorAll('article[data-testid="tweet"]');
      let newlyFoundCount = 0;

      for (let tweet of tweets) {
        const userElement = tweet.querySelector('[data-testid="User-Name"]');
        if (!userElement) continue;

        const userNameContent = userElement.innerText;
        const screenNameMatch = userNameContent.match(/@([a-zA-Z0-9_]+)/);

        if (!screenNameMatch) continue;
        const screenName = screenNameMatch[1];
        const textElement = tweet.querySelector('[data-testid="tweetText"]');
        const textContent = textElement ? textElement.innerText : "";

        // 生成推文特征码，防止 Twitter 的 React 虚拟列表复用 DOM 节点导致判定失效
        const signature = screenName + "|" + textContent.length;
        if (tweet.dataset.botSignature === signature) continue;

        tweet.dataset.botSignature = signature;

        // 每次重新评估新的节点时，先移除隐藏类，防止正常推文被复用隐藏
        tweet.classList.remove('bot-blocker-hidden');

        if (LocalRuleEngine.isBot(userNameContent, screenName, textContent)) {
          tweet.classList.add('bot-blocker-hidden');

          if (!this.blockQueue.includes(screenName)) {
            this.blockQueue.push(screenName);
            this.saveQueue();
            newlyFoundCount++;
          }
        }
      }

      if (newlyFoundCount > 0) {
        this.processQueue();
      }
    }

    updateUI() {
      if (!this.mainBtn) return;
      if (this.blockQueue.length > 0) {
        this.mainBtn.innerText = `🤖 自动清理中... (队列: ${this.blockQueue.length})`;
        this.mainBtn.style.background = '#e0245e';
        this.mainBtn.style.cursor = 'wait';
      } else {
        this.mainBtn.innerText = '🤖 纯本地净化运行中';
        this.mainBtn.style.background = '#00ba7c';
        this.mainBtn.style.cursor = 'default';
      }
    }

    initUI() {
      if (document.getElementById('bot-blocker-local-container')) return;

      const container = document.createElement('div');
      container.id = 'bot-blocker-local-container';
      container.style.cssText = `
                position: fixed; bottom: 24px; right: 24px; z-index: 9999;
                display: flex; gap: 12px; align-items: center;
                background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(12px);
                padding: 8px; border-radius: 9999px; border: 1px solid rgba(255,255,255,0.1);
                box-shadow: 0 8px 32px rgba(0,0,0,0.2);
            `;

      this.mainBtn = document.createElement('button');
      this.updateUI();
      this.mainBtn.style.cssText = `
                padding: 12px 24px; color: white; border: none; border-radius: 9999px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto;
                font-size: 15px; font-weight: 700; transition: all 0.2s ease;
            `;

      container.appendChild(this.mainBtn);
      document.body.appendChild(container);
    }
  }

  setTimeout(() => {
    new BotBlockerApp();
  }, 3000);

})();