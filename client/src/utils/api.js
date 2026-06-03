import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000
})

// 请求拦截器
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// 响应拦截器
api.interceptors.response.use(
  response => response.data,
  error => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// 认证
export const auth = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  getMe: () => api.get('/auth/me')
}

// 对话
export const chat = {
  getHistory: (limit = 50) => api.get(`/chat/history?limit=${limit}`)
}

// 笔记生成
export const summary = {
  generate: (date_key) => api.post('/summary/generate', { date_key }),
  poll: (taskId) => api.get(`/summary/poll/${taskId}`)
}

// 日报
export const report = {
  getList: (page = 1, pageSize = 20) => api.get(`/report/list?page=${page}&pageSize=${pageSize}`),
  get: (date) => api.get(`/report/${date}`),
  share: (date_key) => api.post('/report/share', { date_key }),
  getShared: (token) => api.get(`/report/shared/${token}`)
}

// 导入
export const importData = {
  conversations: (conversations) => api.post('/import', { conversations })
}

// 发送消息（普通请求）
export async function sendMessage(message) {
  const token = localStorage.getItem('token')

  const response = await fetch('/api/chat/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ message })
  })
  return response.json()
}

export default api
