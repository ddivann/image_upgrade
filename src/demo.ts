import { ImageEnhancer } from './api/index';
import { splitSprite } from './utils/sprite';

const enhancer = new ImageEnhancer();

const chatFeed = document.getElementById('chat-feed') as HTMLDivElement;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const triggerUpload = document.getElementById('trigger-upload') as HTMLDivElement;
const btnSend = document.getElementById('btn-send') as HTMLButtonElement;
const btnDataset = document.getElementById('btn-dataset') as HTMLButtonElement;

const datasetSpriteUrl = new URL('../test_images/b55e0d13-ea3a-40f7-a26c-90fbd4aa1497.png', import.meta.url).href;
const datasetRows = 5;
const datasetCols = 7;

let currentSelectedFile: File | null = null;

// UI Helpers
const scrollToBottom = () => {
    chatFeed.scrollTop = chatFeed.scrollHeight;
};

const createUserMessage = (fileUrl: string, fileName: string) => {
    const msg = document.createElement('div');
    msg.className = 'message user';
    msg.innerHTML = `
      <div class="message-content">
        <div class="avatar user-av">Вы</div>
        <div class="text-content">
          <p>Пожалуйста, улучши это изображение: ${fileName}</p>
          <img src="${fileUrl}" class="image-preview" />
        </div>
      </div>
    `;
    chatFeed.appendChild(msg);
    scrollToBottom();
};

const createAssistantMessage = () => {
    const msg = document.createElement('div');
    msg.className = 'message assistant';
    
    const wrapper = document.createElement('div');
    wrapper.className = 'message-content';
    msg.appendChild(wrapper);

    const avatar = document.createElement('div');
    avatar.className = 'avatar assistant-av';
    avatar.textContent = 'AI';
    wrapper.appendChild(avatar);

    const content = document.createElement('div');
    content.className = 'text-content';
    wrapper.appendChild(content);

    // Interactive parts
    const statusText = document.createElement('div');
    statusText.className = 'status-badge';
    statusText.textContent = 'Подготовка...';
    content.appendChild(statusText);

    const progressContainer = document.createElement('div');
    progressContainer.className = 'progress-track';
    const progressBar = document.createElement('div');
    progressBar.className = 'progress-bar';
    progressContainer.appendChild(progressBar);
    content.appendChild(progressContainer);

    const resultImg = document.createElement('img');
    resultImg.className = 'image-preview';
    resultImg.style.display = 'none';
    content.appendChild(resultImg);

    const resultGrid = document.createElement('div');
    resultGrid.className = 'result-grid';
    resultGrid.style.display = 'none';
    content.appendChild(resultGrid);

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn-cancel';
    cancelBtn.textContent = 'Отменить обработку';
    content.appendChild(cancelBtn);

    chatFeed.appendChild(msg);
    scrollToBottom();

    return { statusText, progressBar, resultImg, resultGrid, cancelBtn, progressContainer };
};

const appendDatasetTile = (grid: HTMLDivElement, blob: Blob, row: number, col: number) => {
    const card = document.createElement('div');
    card.className = 'tile-card';

    const thumb = document.createElement('img');
    thumb.className = 'tile-thumb';
    thumb.src = URL.createObjectURL(blob);

    const label = document.createElement('div');
    label.className = 'tile-label';
    label.textContent = `Ряд ${row}, фильтр ${col}`;

    const downloadLink = document.createElement('a');
    downloadLink.className = 'tile-download';
    downloadLink.href = thumb.src;
    downloadLink.download = `dataset_tile_r${row}_c${col}.png`;
    downloadLink.textContent = 'Скачать';

    card.appendChild(thumb);
    card.appendChild(label);
    card.appendChild(downloadLink);
    grid.appendChild(card);
};

// Events
triggerUpload.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', () => {
    if (fileInput.files?.length) {
        currentSelectedFile = fileInput.files[0];
        triggerUpload.textContent = `✔ Выбран файл: ${currentSelectedFile.name}`;
        triggerUpload.style.color = '#10a37f';
        btnSend.disabled = false;
    }
});

btnDataset.addEventListener('click', async () => {
    btnDataset.disabled = true;
    btnSend.disabled = true;
    triggerUpload.textContent = 'Запуск теста датасета...';
    triggerUpload.style.color = '#8e8ea0';

    const originalUrl = datasetSpriteUrl;
    createUserMessage(originalUrl, 'test_images sprite');
    const ui = createAssistantMessage();
    ui.statusText.textContent = 'Разбиваю датасет на плитки...';

    try {
        const tiles = await splitSprite(datasetSpriteUrl, datasetRows, datasetCols);
        ui.statusText.textContent = `Плиток получено: ${tiles.length}. Запуск обработки...`;
        ui.resultGrid.style.display = 'grid';
        ui.resultGrid.innerHTML = '';

        let completedCount = 0;
        for (let index = 0; index < tiles.length; index += 1) {
            const row = Math.floor(index / datasetCols) + 1;
            const col = (index % datasetCols) + 1;
            ui.statusText.textContent = `Обрабатываю плитку ${index + 1}/${tiles.length} (ряд ${row}, фильтр ${col})...`;
            ui.progressBar.style.width = '0%';

            const taskId = await enhancer.submitTask(tiles[index]);
            const unsubscribe = enhancer.onTaskStatusChange((progress) => {
                if (progress.taskId !== taskId) return;
                ui.progressBar.style.width = `${progress.progress}%`;
                ui.statusText.textContent = `Плитка ${index + 1}/${tiles.length}: ${progress.status} (${progress.progress}%)`;
            });

            const resultBlob = await enhancer.getResult(taskId);
            appendDatasetTile(ui.resultGrid, resultBlob, row, col);
            unsubscribe();
            completedCount += 1;
        }

        ui.statusText.textContent = `Тест датасета завершён: ${completedCount}/${tiles.length} успешно.`;
        ui.statusText.style.color = '#10a37f';
        ui.progressBar.style.width = '100%';
        ui.cancelBtn.style.display = 'none';
    } catch (err: any) {
        ui.statusText.textContent = `Ошибка теста датасета: ${err.message}`;
        ui.statusText.style.color = '#ff6b6b';
        ui.progressBar.style.display = 'none';
        ui.cancelBtn.style.display = 'none';
    } finally {
        btnDataset.disabled = false;
        btnSend.disabled = false;
        triggerUpload.textContent = 'Прикрепить изображение для улучшения...';
        triggerUpload.style.color = '#8e8ea0';
    }
});

btnSend.addEventListener('click', async () => {
    if (!currentSelectedFile) return;

    btnSend.disabled = true;
    triggerUpload.textContent = 'Прикрепить изображение для улучшения...';
    triggerUpload.style.color = '#8e8ea0';
    
    const file = currentSelectedFile;
    currentSelectedFile = null;
    fileInput.value = ''; // Сбрасываем input, чтобы то же самое фото можно было загрузить снова

    // 1. Render User Message
    const originalUrl = URL.createObjectURL(file);
    createUserMessage(originalUrl, file.name);

    // 2. Render Assistant Message structure
    const ui = createAssistantMessage();

    // 3. Submit logic
    let taskId: string | null = null;
    try {
        taskId = await enhancer.submitTask(file);
        
        // Cancel logic
        ui.cancelBtn.onclick = async () => {
            if (taskId) {
                await enhancer.cancelTask(taskId);
                ui.statusText.textContent = 'Обработка отменена пользователем.';
                ui.statusText.style.color = '#ff6b6b';
                ui.cancelBtn.style.display = 'none';
                ui.progressContainer.style.display = 'none';
                ui.cancelBtn.disabled = true;
            }
        };

        const unsubscribe = enhancer.onTaskStatusChange((progress) => {
            if (progress.taskId !== taskId) return;
            
            ui.progressBar.style.width = `${progress.progress}%`;
            ui.statusText.textContent = `Статус: ${progress.status} (${progress.progress}%)`;
        });

        // Wait for worker
        const resultBlob = await enhancer.getResult(taskId);
        unsubscribe(); // cleanup
        
        // Show result
        const enhancedUrl = URL.createObjectURL(resultBlob);
        ui.resultImg.src = enhancedUrl;
        ui.resultImg.style.display = 'block';
        
        ui.statusText.textContent = 'Готово! Изображение улучшено.';
        ui.statusText.style.background = 'transparent';
        ui.statusText.style.padding = '0';
        ui.statusText.style.color = '#10a37f';
        ui.progressContainer.style.display = 'none';
        ui.cancelBtn.style.display = 'none';

        scrollToBottom();
    } catch (err: any) {
        ui.statusText.textContent = `Ошибка: ${err.message}`;
        ui.statusText.style.color = '#ff6b6b';
        ui.progressContainer.style.display = 'none';
        ui.cancelBtn.style.display = 'none';
    }
});
