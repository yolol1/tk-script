// ==UserScript==
// @name         Twitter/X 纯本地规则拉黑机器人 (零延迟升级版)
// @namespace    http://tampermonkey.net/
// @version      7.2
// @description  摒弃AI，使用极速的本地正则规则判定并拉黑推特黄推和引流号，专门针对同音字变种和多行纯表情刷屏优化。
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
    // Twitter Web 端通用的只读型 Bearer Token (用于前端 API 认证)
    BEARER_TOKEN: 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
    MIN_BLOCK_DELAY: 800,  // 最小拉黑间隔(毫秒)，保护推特账号防 429
    MAX_BLOCK_DELAY: 1500  // 最大拉黑间隔(毫秒)
  };

  // --------------------------------------------------------
  // 1. 自定义 UI 系统 (轻量化 Toast 提示)
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
  // 2. 核心网络通信 (Twitter Block API)
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
  // 3. 本地判定规则引擎 (全面重构升级版)
  // --------------------------------------------------------
  class LocalRuleEngine {
    static isBot(displayName, textContent) {
      const trimmedText = textContent.trim();
      const strippedText = trimmedText.replace(/[\s\p{Z}\p{Cf}]/gu, '');

      // ==========================================
      // 规则 1：高危账号名称拦截
      // ==========================================
      // 优化：补充了“全城”、以及“约”字的多种同音/拼音变体（炮/泡/萢/拍/p/P）
      const nameSpamRegex = /(?:点(?:击)?|看)(?:主页|头像|置顶)|主页自取|进群选人|资源(?:入口)?|找炮友|约(?:炮|泡|萢|拍|p|P|见|妹)|破处|裸聊|福利姬|母狗|找主人|真实可靠|门槛|同城|全城|面付|外围|空降|品茶|修车|留[联连]系|原味|探花|楼凤|伴游|互粉|互关|互fo|fo back|秒回|赌场|澳门|娱乐城|百家乐|[加➕][Vv微威]|vx|威信|Q群|TG群|全国[1-9]线|附近(?:好友|真实)|无偿(?:线下|约)|处男(?:免费)?|免费破处/i;
      if (nameSpamRegex.test(displayName)) {
        return true;
      }

      if (trimmedText.length > 0) {
        // ==========================================
        // 规则 2：高危正文内容拦截
        // ==========================================
        const textSpamRegex = /主页有惊喜|看我主页|看主页|看置顶|加[Vv微信]{1,2}看|门槛.*[红包|付费]|全网最[低全]|同城|全城|约(?:炮|泡|萢|拍|p|P)|裸聊|福利姬|🔞|💦/i;
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
        // 规则 4 & 5：无意义短文本 / 纯表情变种专杀
        // ==========================================
        // 判断文本中是否包含任何标准的英文字母或汉字
        const hasLetterOrCJK = /[a-zA-Z\u4e00-\u9fa5]/.test(trimmedText);

        if (!hasLetterOrCJK) {
          // 这种情况说明回复全是表情、符号、数字或不可见字符

          // 1. 如果包含数字（针对 "🚀💎6" 变种）
          if (/\d/.test(trimmedText)) return true;

          // 2. 如果包含换行多行排版（针对截图中的 "🎠\n🎠 🎢\n🎠" 变种）
          // 正常用户极少会刻意将纯表情分成多行来回复
          const lineCount = trimmedText.split(/\r\n|\r|\n/).length;
          if (lineCount >= 2) return true;

          // 3. 防修饰符/零宽字符变种
          // 剥离所有的空白符、排版控制符(\p{C})和变音修饰符(\p{M})，如果发现什么可视内容都没了，杀掉
          const visibleOnly = trimmedText.replace(/[\s\p{Z}\p{C}\p{M}]/gu, '');
          if (visibleOnly.length === 0) return true;

        } else if (trimmedText.length <= 15) {
          // ==========================================
          // 规则 6：乱码+表情 防屏蔽变种 (如 "K 14 n 🌸")
          // ==========================================
          const hasEmojiAny = /[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Emoji}]/u.test(trimmedText);
          if (hasEmojiAny) {
            // 移除所有标点、符号、表情和空白
            const pureText = trimmedText.replace(/[\s\p{Z}\p{C}\p{M}\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Emoji}\p{Symbol}\p{Punctuation}]/gu, '');
            // 如果仅剩下极其微量的英文字母，且没有汉字
            const hasCJK = /[\u4e00-\u9fa5]/.test(pureText);
            if (!hasCJK && pureText.length > 0 && pureText.length <= 4) {
              return true;
            }
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
      this.blockQueue = [];
      this.isQueueRunning = false;
      this.initUI();
    }

    sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    async processQueue() {
      if (this.isQueueRunning) return;
      this.isQueueRunning = true;

      let blockedCount = 0;
      const total = this.blockQueue.length;

      while (this.blockQueue.length > 0) {
        this.updateMainButtonState('running', `拉黑执行中 (剩余 ${this.blockQueue.length})...`);
        const handle = this.blockQueue.shift();

        const success = await TwitterAPI.blockUser(handle);
        if (success) blockedCount++;

        const delay = Math.floor(Math.random() * (CONFIG.MAX_BLOCK_DELAY - CONFIG.MIN_BLOCK_DELAY)) + CONFIG.MIN_BLOCK_DELAY;
        await this.sleep(delay);
      }

      this.isQueueRunning = false;
      this.updateMainButtonState('idle', '🤖 本地规则扫描净化');
      if (blockedCount > 0) {
        Toaster.show(`拉黑队列执行完毕，成功屏蔽 ${blockedCount} 个账号`, 'success');
      }
    }

    scanAndAnalyze() {
      if (this.isQueueRunning) {
        Toaster.show('拉黑任务正在执行中，请稍后...', 'warning');
        return;
      }

      this.updateMainButtonState('running', '高速正则匹配中...');

      const tweets = document.querySelectorAll('article[data-testid="tweet"]:not([data-bot-checked])');
      let foundBotsCount = 0;

      for (let tweet of tweets) {
        tweet.setAttribute('data-bot-checked', 'true');

        const textElement = tweet.querySelector('[data-testid="tweetText"]');
        const userElement = tweet.querySelector('[data-testid="User-Name"]');
        if (!userElement) continue;

        const userNameContent = userElement.innerText;
        const displayName = userNameContent.split('\n')[0] || "";
        const screenNameMatch = userNameContent.match(/@([a-zA-Z0-9_]+)/);

        if (!screenNameMatch) continue;
        const screenName = screenNameMatch[1];
        const textContent = textElement ? textElement.innerText : "";

        if (LocalRuleEngine.isBot(displayName, textContent)) {
          tweet.style.transition = 'opacity 0.3s ease';
          tweet.style.opacity = '0';
          setTimeout(() => { tweet.style.display = 'none'; }, 300);

          if (!this.blockQueue.includes(screenName)) {
            this.blockQueue.push(screenName);
            foundBotsCount++;
          }
        }
      }

      if (foundBotsCount > 0) {
        Toaster.show(`规则命中！发现 ${foundBotsCount} 个机器人，开始拉黑...`, 'warning');
        this.processQueue();
      } else {
        Toaster.show('当前页面未命中任何机器人规则', 'info');
        this.updateMainButtonState('idle', '🤖 本地规则扫描净化');
      }
    }

    updateMainButtonState(state, text) {
      if (!this.mainBtn) return;
      this.mainBtn.innerText = text;
      if (state === 'idle') {
        this.mainBtn.style.background = '#f4212e';
        this.mainBtn.style.cursor = 'pointer';
        this.mainBtn.style.opacity = '1';
      } else if (state === 'running') {
        this.mainBtn.style.background = '#e0245e';
        this.mainBtn.style.cursor = 'wait';
        this.mainBtn.style.opacity = '0.8';
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
      this.updateMainButtonState('idle', '🤖 本地规则扫描净化');
      this.mainBtn.style.cssText = `
                padding: 12px 24px; color: white; border: none; border-radius: 9999px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto;
                font-size: 15px; font-weight: 700; transition: all 0.2s ease;
            `;

      this.mainBtn.onmouseover = () => { if (this.mainBtn.style.cursor === 'pointer') this.mainBtn.style.transform = 'scale(1.02)'; };
      this.mainBtn.onmouseout = () => { this.mainBtn.style.transform = 'scale(1)'; };
      this.mainBtn.onclick = () => this.scanAndAnalyze();

      container.appendChild(this.mainBtn);
      document.body.appendChild(container);
    }
  }

  setTimeout(() => {
    new BotBlockerApp();
  }, 3000);

})();