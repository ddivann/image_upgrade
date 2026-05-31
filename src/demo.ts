import { ImageEnhancer } from './api/index';

const enhancer = new ImageEnhancer();

const chatFeed = document.getElementById('chat-feed') as HTMLDivElement;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const triggerUpload = document.getElementById('trigger-upload') as HTMLDivElement;
const btnSend = document.getElementById('btn-send') as HTMLButtonElement;

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

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn-cancel';
    cancelBtn.textContent = 'Отменить обработку';
    content.appendChild(cancelBtn);

    chatFeed.appendChild(msg);
    scrollToBottom();

    return { statusText, progressBar, resultImg, cancelBtn, progressContainer };
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
