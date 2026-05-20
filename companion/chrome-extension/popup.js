const content = document.getElementById('content')

function showLoading(msg) {
  content.innerHTML = `
    <div class="status">
      <div class="loading"></div>
      <p style="color:#9ca3af;font-size:13px">${msg}</p>
    </div>`
}

function showError(msg) {
  content.innerHTML = `<div class="status"><div class="error">${msg}</div>
    <button class="btn btn-secondary" onclick="extractCookies()">重试</button></div>`
}

function showSuccess(cookieStr, count) {
  const data = JSON.stringify({ t: 'wd', c: cookieStr, ts: Date.now() })
  // Generate QR using a minimal lib
  content.innerHTML = `
    <div class="status">
      <div class="success">&#10003;</div>
      <p style="color:#9ca3af;font-size:13px">已提取 <b style="color:#fff">${count}</b> 条有效 Cookie</p>
    </div>
    <div id="qrcode"></div>
    <p class="info">用微店抢购助手扫一扫</p>
    <p class="account-name">或将以下内容粘贴到 PWA 账号页的 Cookie 字段中</p>
    <textarea readonly style="width:100%;height:48px;background:#0f0f1a;border:1px solid #333;color:#aaa;font-size:10px;border-radius:6px;padding:4px;resize:none;margin-top:4px;font-family:monospace">${cookieStr}</textarea>
  `
  renderQR(data)
}

function renderQR(text) {
  const el = document.getElementById('qrcode')
  if (!el) return

  // Minimal QR generation (alphanumeric, optimized for small data)
  try {
    const typeNumber = 0 // auto
    const errorCorrection = 'L'
    const qr = qrcodegen(typeNumber, errorCorrection)
    qr.addData(text)
    qr.make()
    const size = qr.getModuleCount()
    const canvas = document.createElement('canvas')
    const scale = 4
    canvas.width = canvas.height = size * scale
    const ctx = canvas.getContext('2d')
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        ctx.fillStyle = qr.isDark(r, c) ? '#000' : '#fff'
        ctx.fillRect(c * scale, r * scale, scale, scale)
      }
    }
    el.innerHTML = ''
    el.appendChild(canvas)
  } catch {
    el.innerHTML = '<p class="info" style="color:#f87171">二维码生成失败，请用文本方式导入</p>'
  }
}

// Minimal QR code generator
function qrcodegen(typeNumber, errorCorrection) {
  const QRErrorCorrectLevel = { L: 1 }
  const QRMode = { MODE_ALPHA_NUM: 4 }
  const ecc = QRErrorCorrectLevel[errorCorrection] || 1

  function QRBitBuffer() {
    this.buffer = []
    this.length = 0
  }
  QRBitBuffer.prototype = {
    get: function (i) { const b = Math.floor(i / 8); return ((this.buffer[b] >>> (7 - i % 8)) & 1) === 1 },
    put: function (num, len) { for (let i = 0; i < len; i++) this.putBit(((num >>> (len - i - 1)) & 1) === 1) },
    putBit: function (bit) { const b = Math.floor(this.length / 8); if (this.buffer.length <= b) this.buffer.push(0); if (bit) this.buffer[b] |= 0x80 >>> this.length % 8; this.length++ }
  }

  function QR8bitByte(data) {
    this.mode = QRMode.MODE_ALPHA_NUM
    this.data = data
  }
  QR8bitByte.prototype = {
    getLength: function () { return this.data.length },
    write: function (buffer) {
      const alphaNumChars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:'
      const d = this.data.toUpperCase()
      for (let i = 0; i < d.length; i++) {
        if (i % 2 === 0 && i + 1 < d.length) {
          const v = alphaNumChars.indexOf(d[i]) * 45 + alphaNumChars.indexOf(d[i + 1])
          buffer.put(v, 11)
          i++
        } else {
          buffer.put(alphaNumChars.indexOf(d[i]), 6)
        }
      }
    }
  }

  // Use a simple QR approach: create a matrix, add data pattern manually
  function QRCode() {
    this.typeNumber = 5 // fixed small size for short text
    this.errorCorrectLevel = ecc
    this.modules = null
    this.moduleCount = 0
    this.dataCache = null
  }
  QRCode.prototype = {
    addData: function (data) { this.dataCache = new QR8bitByte(data) },
    make: function () {
      this.makeImpl(false, this.getBestMaskPattern())
    },
    makeImpl: function (test, maskPattern) {
      this.moduleCount = this.typeNumber * 4 + 17
      this.modules = new Array(this.moduleCount)
      for (let i = 0; i < this.moduleCount; i++) {
        this.modules[i] = new Array(this.moduleCount)
        for (let j = 0; j < this.moduleCount; j++) this.modules[i][j] = null
      }
      this.setupPositionProbePattern(0, 0)
      this.setupPositionProbePattern(this.moduleCount - 7, 0)
      this.setupPositionProbePattern(0, this.moduleCount - 7)
      this.setupPositionAdjustPattern()
      this.setupTimingPattern()
      this.setupTypeInfo(test, maskPattern)
      if (this.typeNumber >= 7) this.setupTypeNumber(test)
      const data = this.dataCache
      const buffer = new QRBitBuffer()
      data.write(buffer)
      // Pad
      for (let i = 0; i < 4; i++) buffer.putBit(false)
      while (buffer.length % 8 !== 0) buffer.putBit(false)
      const padBytes = [0xEC, 0x11]
      let padIdx = 0
      const totalBits = this.moduleCount * this.moduleCount
      const reserved = this.getReservedBitCount()
      while (buffer.length + reserved < totalBits) {
        buffer.put(padBytes[padIdx], 8)
        padIdx = (padIdx + 1) % 2
      }
      let bitIdx = 0
      for (let col = this.moduleCount - 1; col >= 1; col -= 2) {
        if (col === 6) col = 5
        for (let row = 0; row < this.moduleCount; row++) {
          for (let c = 0; c < 2; c++) {
            const cc = col - c
            if (this.modules[row][cc] === null) {
              let dark = false
              if (bitIdx < buffer.length) dark = buffer.get(bitIdx)
              bitIdx++
              this.modules[row][cc] = dark
            }
          }
        }
        col--
        if (col <= 1) break
        for (let row = this.moduleCount - 1; row >= 0; row--) {
          for (let c = 0; c < 2; c++) {
            const cc = col - c
            if (this.modules[row][cc] === null) {
              let dark = false
              if (bitIdx < buffer.length) dark = buffer.get(bitIdx)
              bitIdx++
              this.modules[row][cc] = dark
            }
          }
        }
      }
    },
    setupPositionProbePattern: function (row, col) {
      for (let r = -1; r <= 7; r++) {
        for (let c = -1; c <= 7; c++) {
          if (row + r >= 0 && col + c >= 0 && row + r < this.moduleCount && col + c < this.moduleCount) {
            this.modules[row + r][col + c] =
              (0 <= r && r <= 6 && (c === 0 || c === 6)) ||
              (0 <= c && c <= 6 && (r === 0 || r === 6)) ||
              (2 <= r && r <= 4 && 2 <= c && c <= 4)
          }
        }
      }
    },
    setupPositionAdjustPattern: function () {
      const pos = [6, this.moduleCount - 7]
      for (const r of pos) for (const c of pos) {
        if (this.modules[r][c] !== null) continue
        for (let dr = -2; dr <= 2; dr++)
          for (let dc = -2; dc <= 2; dc++)
            this.modules[r + dr][c + dc] = dr === -2 || dr === 2 || dc === -2 || dc === 2 || (dr === 0 && dc === 0)
      }
    },
    setupTimingPattern: function () {
      for (let i = 8; i < this.moduleCount - 8; i++) {
        if (this.modules[i][6] === null) this.modules[i][6] = i % 2 === 0
        if (this.modules[6][i] === null) this.modules[6][i] = i % 2 === 0
      }
    },
    setupTypeInfo: function (test, maskPattern) {
      const data = (this.errorCorrectLevel << 3) | maskPattern
      const bits = this.getBCHTypeInfo(data)
      for (let i = 0; i < 15; i++) {
        const bit = ((bits >> i) & 1) === 1
        if (i < 6) {
          this.modules[i][8] = bit
        } else if (i < 8) {
          this.modules[7 - (i - 6)][8] = bit
        } else if (i < 14) {
          this.modules[8][this.moduleCount - 15 + i] = bit
        } else {
          this.modules[8][15 - (i - 14)] = bit
        }
      }
      this.modules[this.moduleCount - 8][8] = true
    },
    setupTypeNumber: function (test) {},
    getBestMaskPattern: function () { return 2 },
    getModuleCount: function () { return this.moduleCount },
    isDark: function (row, col) { return this.modules[row][col] === true },
    getReservedBitCount: function () {
      return (this.moduleCount * 8 - 8 * 2) * 2
    },
    getBCHTypeInfo: function (data) {
      let d = data << 10
      while (d >>> 10) d ^= 0x537 << (16 - Math.floor(Math.log2(d >>> 10)) - 1)
      return ((data << 10) | d) ^ 0x5412
    }
  }

  return new QRCode()
}

async function extractCookies() {
  showLoading('正在读取微店 Cookie...')

  try {
    const cookies = await chrome.cookies.getAll({ domain: 'weidian.com' })
    const allCookies = await chrome.cookies.getAll({ domain: '.weidian.com' })

    // Also try h5 subdomain
    const h5Cookies = await chrome.cookies.getAll({ domain: 'h5.weidian.com' })

    const all = [...cookies, ...allCookies, ...h5Cookies]
    const unique = new Map()
    for (const c of all) {
      if (c.name && c.value && !c.name.startsWith('_ga') && !c.name.startsWith('Hm_')) {
        unique.set(c.name, c.value)
      }
    }

    if (unique.size === 0) {
      showError('未找到微店 Cookie。<br><br>请先在浏览器中打开 <b>weidian.com</b> 并登录，然后再点扩展图标。')
      return
    }

    const cookieStr = [...unique.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
    showSuccess(cookieStr, unique.size)
  } catch (err) {
    showError('读取失败: ' + err.message)
  }
}

extractCookies()
