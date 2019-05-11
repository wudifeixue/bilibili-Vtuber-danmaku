const fs = require('fs').promises

const biliAPI = require('bili-api')
const LiveWS = require('bilibili-live-ws')

const race = (...args) => new Promise((resolve, reject) => {
  setTimeout(reject, 1000 * 5)
  biliAPI(...args)
    .then(resolve)
})

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

const vtbs = require('./vtbs.moe/api/vtbs')

const openRoom = roomid => {
  let ws = new LiveWS(roomid)
  let lastTime = ''
  let storm = []
  ws.once('live', () => {
    console.log(`READY: ${roomid}`)
    ws.on('DANMU_MSG', async ({ info }) => {
      if (!info[0][9]) {
        let message = info[1]
        if (!message.includes('TIME') || !message.includes('ONLINE')) {
          let date = new Date()
          let filename = `${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}.txt`
          let time = `${date.getHours()}:${date.getMinutes()}`
          if (lastTime !== time) {
            lastTime = time
            await fs.appendFile(`${roomid}/${filename}`, `TIME${lastTime}ONLINE${ws.online}\n`)
          }
          await fs.appendFile(`${roomid}/${filename}`, `${message}\n`)
          // console.log(`${roomid}: ${message}`)
        }
      }
    })
  })
  // ws.on('SEND_GIFT', ({ data }) => {
  //   if (data.giftName === '节奏风暴') {
  // 		console.log(data)
  // 		storm.push(data.metadata)
  //   }
  // })
  ws.once('open', () => {
    ws.once('close', async () => {
      console.log(`CLOSE: ${roomid}`)
      await wait(1000)
      console.log(`REOPEN: ${roomid}`)
      openRoom(roomid)
    })
  })
  ws.on('error', async () => {
    console.log(`ERROR: ${roomid}`)
    ws.terminate()
    await wait(1000)
    console.log(`REOPEN: ${roomid}`)
    openRoom(roomid)
  })
}

(async () => {
  let folders = await fs.readdir('.')
  for (let i = 0; i < vtbs.length; i++) {
    let { mid } = vtbs[i]
    let object = await race({ mid }, ['roomid'], { wait: 1000 }).catch(() => undefined)
    if (!object) {
      i--
      console.log(`RETRY: ${mid}`)
      await wait(1000 * 5)
      continue
    }
    if (object.roomid) {
      if (!folders.includes(String(object.roomid))) {
        await fs.mkdir(String(object.roomid))
      }
      console.log(`OPEN: ${i + 1}/${vtbs.length} - ${mid} - ${object.roomid}`)
      openRoom(object.roomid)
    }
  }
})()
