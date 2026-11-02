package de.kidsdaily365.launcher

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.net.InetAddress
import java.net.ServerSocket
import java.net.SocketException
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

/** Tiny loopback HTTP fixture: exercises the real HttpURLConnection transport, not a mocked API. */
class HttpLauncherApiTest {
    private data class Reply(val status: Int = 200, val body: String = fixture(),
        val type: String = "application/json", val location: String? = null)
    private data class Request(val line: String, val headers: Map<String, String>, val body: String)
    private class TestServer(vararg reply: Reply) : AutoCloseable {
        private val socket = ServerSocket(0, 50, InetAddress.getByName("127.0.0.1"))
        val address = ServerAddress.parse("http://127.0.0.1:${socket.localPort}", true)
        val requests = LinkedBlockingQueue<Request>()
        private val replies = LinkedBlockingQueue(reply.toList())
        @Volatile private var failure: Throwable? = null
        private val worker = thread(isDaemon = true) {
            try {
                while (!socket.isClosed) socket.accept().use { client ->
                    client.soTimeout = 5000
                    val input = client.getInputStream().bufferedReader()
                    val line = input.readLine()
                    val headers = mutableMapOf<String, String>()
                    while (true) {
                        val header = input.readLine() ?: break
                        if (header.isEmpty()) break
                        headers[header.substringBefore(':').lowercase()] = header.substringAfter(':').trim()
                    }
                    val body = CharArray(headers["content-length"]?.toInt() ?: 0)
                    var count = 0
                    while (count < body.size) {
                        val read = input.read(body, count, body.size - count)
                        check(read > 0); count += read
                    }
                    requests.add(Request(line, headers, body.concatToString()))
                    val response = checkNotNull(replies.poll(5, TimeUnit.SECONDS))
                    val bytes = response.body.toByteArray()
                    val location = response.location?.let { "Location: $it\r\n" }.orEmpty()
                    val head = "HTTP/1.1 ${response.status} Test\r\nContent-Type: ${response.type}\r\nContent-Length: ${bytes.size}\r\nConnection: close\r\n${location}\r\n"
                    client.getOutputStream().apply { write(head.toByteArray()); write(bytes); flush() }
                }
            } catch (e: SocketException) { if (!socket.isClosed) failure = e }
            catch (e: Throwable) { failure = e }
        }
        fun take() = checkNotNull(requests.poll(5, TimeUnit.SECONDS))
        override fun close() { socket.close(); worker.join(1000); failure?.let { throw AssertionError(it) } }
    }

    @Test fun `native pairing and reads use fixed endpoints without browser credentials`() {
        val pairing = JSONObject().put("token", "a".repeat(43)).put("deviceId", snapshotFixture().device.id)
            .put("kind", "android").put("expiresIn", 7776000).toString()
        TestServer(Reply(body = pairing), Reply()).use { server ->
            val api = HttpLauncherApi()
            val paired = api.pair(server.address, "fictional")
            val pairRequest = server.take()
            assertEquals("POST /api/device/pair HTTP/1.1", pairRequest.line)
            assertNull(pairRequest.headers["cookie"])
            assertNull(pairRequest.headers["authorization"])
            assertNull(pairRequest.headers["origin"])
            assertEquals("fictional", JSONObject(pairRequest.body).getString("code"))
            assertEquals("android", JSONObject(pairRequest.body).getString("kind"))
            assertEquals(snapshotFixture(), api.snapshot(server.address, paired.token))
            val snapshotRequest = server.take()
            assertEquals("GET /api/launcher/snapshot HTTP/1.1", snapshotRequest.line)
            assertEquals("Bearer ${paired.token}", snapshotRequest.headers["authorization"])
            assertNull(snapshotRequest.headers["cookie"])
        }
    }

    @Test fun `redirects are never followed with bearer credentials`() {
        TestServer(Reply(302, location = "https://example.test/trap")).use { server ->
            val failure = assertThrows(HttpFailure::class.java) { HttpLauncherApi().snapshot(server.address, "a".repeat(43)) }
            assertEquals(302, failure.status)
            assertEquals("GET /api/launcher/snapshot HTTP/1.1", server.take().line)
            assertTrue(server.requests.isEmpty())
        }
    }

    @Test fun `unauthorized responses revoke and oversized or HTML responses are rejected`() {
        for (status in listOf(401, 403)) TestServer(Reply(status)).use { server ->
            assertThrows(AccessRevoked::class.java) { HttpLauncherApi().snapshot(server.address, "a".repeat(43)) }
        }
        for (reply in listOf(Reply(body = "<html>login</html>", type = "text/html"),
            Reply(body = "x".repeat(HttpLauncherApi.MAX_RESPONSE_BYTES + 1)))) TestServer(reply).use { server ->
            assertThrows(ProtocolFailure::class.java) { HttpLauncherApi().snapshot(server.address, "a".repeat(43)) }
        }
    }
}
