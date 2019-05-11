const fs = require('fs').promises

const io = require('socket.io-client')
const socket = io('http://0.0.0.0:9001')
const get = (e, target) => new Promise(resolve => socket.emit(e, target, resolve))

const biliAPI = require('bili-api')
const LiveWS = require('bilibili-live-ws')

const race = (...args) => new Promise((resolve, reject) => {
  setTimeout(reject, 1000 * 5)
  biliAPI(...args)
    .then(resolve)
})

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

let rooms = {}

const openRoom = ({ roomid, speakers = {}, currentFilename = undefined }) => {
  let ws = new LiveWS(roomid)
  rooms[roomid] = ws
  let lastTime = ''
  // let storm = []
  ws.once('live', () => {
    console.log(`READY: ${roomid}`)
    ws.on('DANMU_MSG', async ({ info }) => {
      if (!info[0][9]) {
        let message = info[1]
        if (!message.includes('TIME') || !message.includes('ONLINE')) {
          let mid = info[2][0]
          let date = new Date()
          let filename = `${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}.txt`
          let time = `${date.getHours()}:${date.getMinutes()}`
          if (!currentFilename) {
            currentFilename = filename
          }
          if (currentFilename !== filename) {
            let speakerNum = Object.keys(speakers).length
            let lastFIleName = currentFilename
            currentFilename = filename
            if (speakerNum) {
              speakers = {}
              await fs.appendFile(`${roomid}/${lastFIleName}`, `SPEAKERNUM${speakerNum}\n`)
            }
          }
          speakers[mid] = true
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
  ws.on('heartbeat', async () => {
    if (!currentFilename) {
      currentFilename = filename
    }
    if (currentFilename !== filename) {
      let speakerNum = Object.keys(speakers).length
      let lastFIleName = currentFilename
      currentFilename = filename
      if (speakerNum) {
        speakers = {}
        await fs.appendFile(`${roomid}/${lastFIleName}`, `SPEAKERNUM${speakerNum}\n`)
      }
    }
  })
  ws.on('heartbeat', async online => {
    if (online > 1) {
      let date = new Date()
      let time = `${date.getHours()}:${date.getMinutes()}`
      let filename = `${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}.txt`
      if (lastTime !== time) {
        lastTime = time
        await fs.appendFile(`${roomid}/${filename}`, `TIME${lastTime}ONLINE${online}\n`)
      }
    }
  })
  ws.once('open', () => {
    ws.once('close', async () => {
      console.log(`CLOSE: ${roomid}`)
      if (rooms[roomid]) {
        await wait(500)
        console.log(`REOPEN: ${roomid}`)
        openRoom({ roomid, speakers, currentFilename })
      }
    })
  })
  ws.on('error', async () => {
    console.log(`ERROR: ${roomid}`)
    ws.terminate()
    if (rooms[roomid]) {
      await wait(500)
      console.log(`REOPEN: ${roomid}`)
      openRoom({ roomid, speakers, currentFilename })
    }
  })
}

(async () => {
  for (;;) {
    await wait(1000 * 1)
    let folders = await fs.readdir('.')
    let vtbs = await get('vtbs')
    let roomsEnable = []
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
        let roomid = object.roomid
        roomsEnable.push(roomid)
        if (!rooms[roomid]) {
          if (!folders.includes(String(roomid))) {
            await fs.mkdir(String(roomid))
          }
          console.log(`OPEN: ${i + 1}/${vtbs.length} - ${mid} - ${roomid}`)
          openRoom({ roomid: roomid })
        }
      }
    }
    let roomsOpen = Object.keys(rooms)
    for (let i = 0; i < roomsOpen.length; i++) {
      if (rooms[roomsOpen[i]]) {
        if (!roomsEnable.includes(roomsOpen[i])) {
          console.log(`DISABLE: ${roomsOpen[i]}`);
          rooms[roomsOpen[i]].close()
          rooms[roomsOpen[i]] = false
        }
      }
    }
  }
})()
