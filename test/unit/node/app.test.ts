import { logger } from "@coder/logger"
import * as http from "http"
import { createApp, ensureAddress, handleServerError } from "../../../src/node/app"
import { setDefaults } from "../../../src/node/cli"
import { getAvailablePort } from "../../utils/helpers"

describe("createApp", () => {
  let spy: jest.SpyInstance

  beforeEach(() => {
    spy = jest.spyOn(logger, "error")
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  afterAll(() => {
    jest.restoreAllMocks()
  })

  // TODO@jsjoeio refactor to use beforeEach and afterEach
  it("should return an Express app, a WebSockets Express app and an http server", async () => {
    const port = await getAvailablePort()
    const defaultArgs = await setDefaults({
      port,
      _: [],
    })
    const [app, wsApp, server] = await createApp(defaultArgs)

    // This doesn't check much, but it's a good sanity check
    // to ensure we actually get back values from createApp
    expect(app).not.toBeNull()
    expect(wsApp).not.toBeNull()
    expect(server).toBeInstanceOf(http.Server)

    // Cleanup
    server.close()
  })

  it("should handle error events on the server", async () => {
    const port = await getAvailablePort()
    const defaultArgs = await setDefaults({
      port,
      _: [],
    })

    // This looks funky, but that's because createApp
    // returns an array like [app, wsApp, server]
    // We only need server which is at index 2
    // we do it this way so ESLint is happy that we're
    // have no declared variables not being used
    const app = await createApp(defaultArgs)
    const server = app[2]

    const testError = new Error("Test error")
    // Emitting error events on servers
    // https://stackoverflow.com/a/33872506/3015595
    server.emit("error", testError)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith(`http server error: ${testError.message} ${testError.stack}`)

    // Cleanup
    server.close()
  })

  it("should reject errors", async () => {
    const port = 2
    const defaultArgs = await setDefaults({
      port,
      _: [],
    })

    // This looks funky, but that's because createApp
    // returns an array like [app, wsApp, server]
    // We only need server which is at index 2
    // we do it this way so ESLint is happy that we're
    // have no declared variables not being used
    async function masterBall() {
      const app = await createApp(defaultArgs)
      const server = app[2]

      const testError = new Error("Test error")
      // Emitting error events on servers
      // https://stackoverflow.com/a/33872506/3015595
      server.emit("error", testError)
      // expect(spy).toHaveBeenCalledTimes(1)
      // expect(spy).toHaveBeenCalledWith(`http server error: ${testError.message} ${testError.stack}`)

      // Cleanup
      server.close()
    }

    expect(() => masterBall()).rejects.toThrow(`listen EACCES: permission denied 127.0.0.1:${port}`)
  })
})

describe("ensureAddress", () => {
  let mockServer: http.Server

  beforeEach(() => {
    mockServer = http.createServer()
  })

  afterEach(() => {
    mockServer.close()
  })

  it("should throw and error if no address", () => {
    expect(() => ensureAddress(mockServer)).toThrow("server has no address")
  })
  it("should return the address if it exists and not a string", async () => {
    const port = await getAvailablePort()
    mockServer.listen(port)
    const address = ensureAddress(mockServer)
    expect(address).toBe(`http://:::${port}`)
  })
  it("should return the address if it exists", async () => {
    mockServer.address = () => "http://localhost:8080"
    const address = ensureAddress(mockServer)
    expect(address).toBe(`http://localhost:8080`)
  })
})

describe("handleServerError", () => {
  let spy: jest.SpyInstance

  beforeEach(() => {
    spy = jest.spyOn(logger, "error")
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  afterAll(() => {
    jest.restoreAllMocks()
  })

  it("should call reject if resolved is false", async () => {
    const resolved = false
    const reject = jest.fn((err: Error) => undefined)
    const error = new Error("handleServerError Error")

    handleServerError(resolved, error, reject)

    expect(reject).toHaveBeenCalledTimes(1)
    expect(reject).toHaveBeenCalledWith(error)
  })

  it("should log an error if resolved is true", async () => {
    const resolved = true
    const reject = jest.fn((err: Error) => undefined)
    const error = new Error("handleServerError Error")

    handleServerError(resolved, error, reject)

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toThrowErrorMatchingSnapshot()
  })
})


// TODO@jsjoeio - write
// make a file owned by root
// restrictive permissions - 600
// no one else can touch it besides root

// make the socket on the file path and i'll get that..

// pass in / into
// create a directory and pass that in as the socket
// with one file and use the directory as the socket path