interface Config {
  private_api_url: string
  page_turning_number: number
  error_img: string
}

interface Article {
  title: string
  link: string | URL
  avatar: string
  author: string
  created: string
}

interface ArticleData {
  article_data: Article[]
  statistical_data: {
    friends_num: number
    active_num: number
    article_num: number
    last_updated_time: string
  }
}

export class FriendCircle {
  config!: Config
  root!: HTMLElement
  start = 0
  allArticles: Article[] = []
  container!: HTMLElement
  randomArticleContainer!: HTMLElement
  statsContainer!: HTMLElement
  loadMoreBtn!: HTMLButtonElement
  modal!: HTMLElement

  load() {
    this.loadMoreArticles()
    this.loadMoreBtn.addEventListener('click', this.loadMoreArticles.bind(this))
    window.onclick = (event) => {
      const modal = document.getElementById('modal')
      if (event.target === modal) {
        this.hideModal()
      }
    }
  }

  init(config: Partial<Config>) {
    this.config = {
      private_api_url: config.private_api_url || '',
      page_turning_number: config.page_turning_number || 20,
      error_img:
        config.error_img ||
        'https://fastly.jsdelivr.net/gh/willow-god/Friend-Circle-Lite@latest/static/favicon.ico'
    }

    this.root = document.getElementById('friend-circle-lite-root') as HTMLElement
    if (!this.root) return

    this.root.innerHTML = ''
    this.createContainers()
  }

  private createContainers() {
    this.randomArticleContainer = this.createElement('div', { id: 'random-article' })
    this.container = this.createElement('div', {
      className: 'articles-container',
      id: 'articles-container'
    })
    this.loadMoreBtn = this.createElement('button', {
      id: 'load-more-btn',
      innerText: 'Load more'
    }) as HTMLButtonElement
    this.statsContainer = this.createElement('div', { id: 'stats-container' })

    this.root.append(
      this.randomArticleContainer,
      this.container,
      this.loadMoreBtn,
      this.statsContainer
    )
  }

  private createElement<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    attributes: Partial<HTMLElementTagNameMap[K]>
  ): HTMLElementTagNameMap[K] {
    const element = document.createElement(tag)
    Object.assign(element, attributes)
    return element
  }

  loadMoreArticles() {
    const cacheKey = 'friend-circle-lite-cache'
    const cacheTimeKey = 'friend-circle-lite-cache-time'
    const cacheTime = localStorage.getItem(cacheTimeKey)
    const now = Date.now()

    if (cacheTime && now - Number(cacheTime) < 10 * 60 * 1000) {
      const cachedDataString = localStorage.getItem(cacheKey)
      const cachedData = cachedDataString ? JSON.parse(cachedDataString) : null
      if (cachedData) {
        this.processArticles(cachedData)
        return
      }
    }

    fetch(`${this.config.private_api_url}all.json`)
      .then((response) => response.json())
      .then((data) => {
        localStorage.setItem(cacheKey, JSON.stringify(data))
        localStorage.setItem(cacheTimeKey, now.toString())
        this.processArticles(data)
      })
      .finally(() => {
        this.loadMoreBtn.innerText = 'Load more'
      })
  }

  processArticles({ article_data, statistical_data }: ArticleData) {
    this.allArticles = article_data
    this.updateStats(statistical_data)
    this.displayRandomArticle()
    this.displayArticles()
  }

  private updateStats(stats: ArticleData['statistical_data']) {
    this.statsContainer.innerHTML = `
      <div>${stats.friends_num} links with ${stats.active_num} active | ${stats.article_num} articles in total</div>
      <div>Updated at ${stats.last_updated_time}</div>
      <div>Powered by <a href="https://github.com/willow-god/Friend-Circle-Lite" target="_blank">FriendCircleLite</a><br></div>
    `
  }

  private displayArticles() {
    const articles = this.allArticles.slice(
      this.start,
      this.start + this.config.page_turning_number
    )
    articles.forEach((article) => this.createArticleCard(article))
    this.start += this.config.page_turning_number

    if (this.start >= this.allArticles.length) {
      this.loadMoreBtn.style.display = 'none'
    }
  }

  private createArticleCard(article: Article) {
    const card = document.createElement('div')
    card.className = 'article'
    card.innerHTML = `
      <div class="article-image author-click">
        <img class="no-lightbox" src="${article.avatar || this.config.error_img}" onerror="this.src='${this.config.error_img}'">
      </div>
      <div class="article-container">
        <div class="article-author author-click">${article.author}</div>
        <a class="article-title" href="${article.link instanceof URL ? article.link.toString() : article.link}" target="_blank">${article.title}</a>
        <div class="article-date">️${article.created.substring(0, 10)}</div>
      </div>
    `
    card.querySelectorAll('.author-click').forEach((el) => {
      el.addEventListener('click', () => {
        this.showAuthorArticles(article.author, article.avatar, article.link)
      })
    })
    this.container.appendChild(card)
  }

  displayRandomArticle() {
    const randomArticle = this.allArticles[Math.floor(Math.random() * this.allArticles.length)]
    this.randomArticleContainer.innerHTML = `
      <div class="random-title">Random Poll</div>
      <div class="article-container">
        <div class="article-author">${randomArticle.author}</div>
        <a class="article-title" href="${randomArticle.link}" target="_blank">${randomArticle.title}</a>
        <div class="article-date">️${randomArticle.created.substring(0, 10)}</div>
      </div>
      <button id="random-refresh">
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><g fill="none"><path d="M24 0v24H0V0zM12.593 23.258l-.011.002l-.071.035l-.02.004l-.014-.004l-.071-.035q-.016-.005-.024.005l-.004.01l-.017.428l.005.02l.01.013l.104.074l.015.004l.012-.004l.104-.074l.012-.016l.004-.017l-.017-.427q-.004-.016-.017-.018m.265-.113l-.013.002l-.185.093l-.01.01l-.003.011l.018.43l.005.012l.008.007l.201.093q.019.005.029-.008l.004-.014l-.034-.614q-.005-.019-.02-.022m-.715.002a.02.02 0 0 0-.027.006l-.006.014l-.034.614q.001.018.017.024l.015-.002l.201-.093l.01-.008l.004-.011l.017-.43l-.003-.012l-.01-.01z"/><path fill="currentColor" d="M2 12.08c-.006-.862.91-1.356 1.618-.975l.095.058l2.678 1.804c.972.655.377 2.143-.734 2.007l-.117-.02l-1.063-.234a8.002 8.002 0 0 0 14.804.605a1 1 0 0 1 1.82.828c-1.987 4.37-6.896 6.793-11.687 5.509A10 10 0 0 1 2 12.08m.903-4.228C4.89 3.482 9.799 1.06 14.59 2.343a10 10 0 0 1 7.414 9.581c.007.863-.91 1.358-1.617.976l-.096-.058l-2.678-1.804c-.972-.655-.377-2.143.734-2.007l.117.02l1.063.234A8.002 8.002 0 0 0 4.723 8.68a1 1 0 1 1-1.82-.828"/></g></svg>
      </button>
    `
    this.randomArticleContainer
      .querySelector('button#random-refresh')
      ?.addEventListener('click', (event) => {
        event.preventDefault()
        this.displayRandomArticle()
      })
  }

  // Enable modal
  showAuthorArticles(author: string, avatar: string, link: string | URL) {
    if (!document.getElementById('fclite-modal')) {
      const modal = this.createElement('div', { id: 'modal', className: 'modal' })
      modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <img class="modal-author-avatar" src="${avatar || this.config.error_img}" alt="">
          <a class="modal-author-name-link" href="${new URL(link.toString()).origin}" target="_blank">${author}</a>
        </div>
        <div id="modal-articles-container"></div>
      </div>
      `
      this.root.appendChild(modal)
    }
    this.modal = document.getElementById('modal') as HTMLElement
    const modalArticlesContainer = document.getElementById(
      'modal-articles-container'
    ) as HTMLElement
    const authorArticles = this.allArticles.filter((article) => article.author === author)
    authorArticles.slice(0, 4).forEach((article) => {
      const articleTemplate = `
        <div class="modal-article">
          <a class="modal-article-title" href="${article.link instanceof URL ? article.link.toString() : article.link}" target="_blank">${article.title}</a>
          <div class="modal-article-date">${article.created.substring(0, 10)}</div>
        </div>`
      modalArticlesContainer.insertAdjacentHTML('beforeend', articleTemplate)
    })

    this.modal.style.display = 'block'
    setTimeout(() => {
      this.modal.classList.add('modal-open')
    }, 10)
  }

  hideModal() {
    this.modal.classList.remove('modal-open')
    this.modal.addEventListener(
      'transitionend',
      () => {
        this.modal.style.display = 'none'
        this.root.removeChild(this.modal)
      },
      { once: true }
    )
  }
}
