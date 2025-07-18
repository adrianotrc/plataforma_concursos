// flashcards-page.js

import { auth, db } from './firebase-config.js';
import { collection, doc, addDoc, query, orderBy, onSnapshot, serverTimestamp, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { gerarFlashcardsAsync, responderFlashcard, getUsageLimits } from './api.js';
import { state } from './main-app.js';

// ELEMENTOS DOM
const btnCriarDeck = document.getElementById('btn-criar-deck');
const containerFormDeck = document.getElementById('container-form-deck');
const historicoDecks = document.getElementById('historico-decks');
const usageCounterDiv = document.getElementById('usage-counter');
const estudoContainer = document.getElementById('flashcard-estudo');

let unsubDecks = null;
let filaCartoes = [];
let deckAberto = null;
let ultimoDeckSolicitado=null;

function showToast(message, type='success', duration=5000){
  const toast=document.createElement('div');
  toast.className=`feedback-toast ${type}`;
  toast.textContent=message;
  document.body.appendChild(toast);
  setTimeout(()=>toast.classList.add('show'),10);
  setTimeout(()=>{toast.classList.remove('show');setTimeout(()=>toast.remove(),500);},duration);
}

function renderHistorico(decks){
  if(!historicoDecks)return;
  if(decks.length===0){historicoDecks.innerHTML='<p>Nenhum deck ainda.</p>';return;}
  historicoDecks.innerHTML=decks.map(deck=>{
    const statusIcon = deck.status==='processing'?'<i class="fas fa-spinner fa-spin"></i>':deck.status==='failed'?'<i class="fas fa-exclamation-triangle" style="color:#ef4444"></i>':'';
    const btnLabel = deck.status==='processing'? 'Gerando...' : deck.status==='failed'? 'Falhou' : 'Estudar';
    const s=deck.stats||{};
    const totalStats=(s.q0||0)+(s.q1||0)+(s.q2||0)+(s.q3||0)+(s.q4||0)+(s.q5||0);
    const perc= totalStats? Math.round(((s.q4||0)+(s.q5||0))*100/totalStats):0;
    const percHtml= totalStats? `<span class='badge-accuracy'>${perc}% fácil</span>`:'';
    return `<div class="plano-item"><div><h3>${deck.materia||'Deck'} ${statusIcon} ${percHtml}</h3><p>${deck.topico||''} • ${deck.cardCount||0} cards</p></div><button class="btn btn-primary btn-abrir-deck" data-id="${deck.deckId}" ${deck.status!=='completed'?'disabled':''}>${btnLabel}</button></div>`;
  }).join('');
}

function ouvirDecks(){
  if(unsubDecks)unsubDecks();
  const q=query(collection(db,`users/${auth.currentUser.uid}/flashcards`),orderBy('criadoEm','desc'));
  unsubDecks = onSnapshot(q,snap=>{
    const decks=snap.docs.map(d=>({id:d.id,...d.data()}));
    renderHistorico(decks);
    snap.docChanges().forEach(change=>{
       if(change.type==='modified'){
         const d=change.doc.data();
         if(d.status==='completed' && d.deckId===ultimoDeckSolicitado){
            showToast('✅ Deck de flashcards pronto!','success',6000);
            ultimoDeckSolicitado=null;
            if(window.processingUI){window.processingUI.removeResultAreaHighlight('#historico-decks');}
         }
       }
    });
  });
}

async function renderUsageInfo(){
  if(!auth.currentUser||!usageCounterDiv)return;
  try{
     const data=await getUsageLimits(auth.currentUser.uid);
     const uso=data.usage.flashcards||0;
     const limite=data.limits.flashcards||0;
     const restantes=limite-uso;
     const plano=data.plan;
     const msg= plano==='trial'?`Você ainda pode gerar ${restantes} de ${limite} decks de flashcards durante o teste.`:`Hoje, você ainda pode gerar ${restantes} de ${limite} decks de flashcards.`;
     usageCounterDiv.textContent=msg;
     usageCounterDiv.style.display='block';
     if(btnCriarDeck)btnCriarDeck.disabled=restantes<=0;
  }catch(e){console.error('Erro usage flashcards',e);usageCounterDiv.style.display='none';}
}

function mostrarFormDeck(){
  containerFormDeck.innerHTML=`<form id="form-deck"><div class="form-field-group"><label>Matéria</label><input type="text" id="deck-materia" placeholder="Ex: Direito Administrativo" required></div><div class="form-field-group"><label>Tópico</label><input type="text" id="deck-topico" placeholder="Ex: Controle de Constitucionalidade" required></div><div class="form-field-group"><label>Quantidade de cards</label><input type="number" id="deck-quantidade" min="5" max="50" value="20"></div><div class="form-actions"><button type="submit" class="btn btn-primary">Gerar Flashcards</button><button type="button" id="btn-cancelar-deck" class="btn btn-ghost">Cancelar</button></div></form>`;
  containerFormDeck.style.display='block';
}

btnCriarDeck?.addEventListener('click',()=>mostrarFormDeck());

containerFormDeck?.addEventListener('click',async e=>{
  if(e.target.id==='btn-cancelar-deck'){
    containerFormDeck.style.display='none';
    containerFormDeck.innerHTML='';
  }
});

containerFormDeck?.addEventListener('submit',async e=>{
  if(e.target.id!=='form-deck')return;
  e.preventDefault();
  const materia=document.getElementById('deck-materia').value;
  const topico=document.getElementById('deck-topico').value;
  const quantidade=parseInt(document.getElementById('deck-quantidade').value,10);
  if(!window.processingUI){showToast('Sistema de processamento indisponível','error');return;}
  window.processingUI.startProcessingWithConfirmation({
    confirmationTitle:'Gerar Deck',
    confirmationMessage:'Gerar flashcards por IA?',
    confirmationIcon:'fas fa-clone',
    processingTitle:'Gerando Deck...',
    processingMessage:'A IA está criando seus flashcards.',
    estimatedTime:'15-30 segundos',
    resultAreaSelector:'#historico-decks',
    onConfirm:async()=>{
      showToast('Deck solicitado! Gerando...','info',3000);
      const resp=await gerarFlashcardsAsync({userId:auth.currentUser.uid,materia,topico,quantidade});
      ultimoDeckSolicitado=resp.deckId;
      return resp;
    },
    onComplete:()=>{
      containerFormDeck.style.display='none';
      containerFormDeck.innerHTML='';
      renderUsageInfo();
    }
  });
});

document.addEventListener('DOMContentLoaded',()=>{
  auth.onAuthStateChanged(user=>{if(user){ouvirDecks();renderUsageInfo();}});
});

function mostrarCartao(){
  if(filaCartoes.length===0){
    estudoContainer.innerHTML='<p>✅ Revisão concluída por hoje!</p>';
    return;
  }
  const card = filaCartoes[0];
  estudoContainer.innerHTML=`<div class="feature-card"><h4>Frente</h4><p>${card.frente}</p><button class="btn btn-primary" id="btn-mostrar-resposta">Mostrar Resposta</button></div>`;
}

estudoContainer?.addEventListener('click',async e=>{
  if(e.target.id==='btn-mostrar-resposta'){
    const card=filaCartoes[0];
    estudoContainer.innerHTML=`<div class="feature-card flashcard"><h4>Resposta</h4><p>${card.verso}</p><p style="font-size:0.85rem;color:#6b7280;margin-top:12px;">Avalie sua lembrança: 0 = Errei &nbsp; … &nbsp; 5 = Muito fácil</p><div class="form-actions"><button class="btn btn-outline btn-quality" data-q="0">0</button><button class="btn btn-outline btn-quality" data-q="1">1</button><button class="btn btn-outline btn-quality" data-q="2">2</button><button class="btn btn-outline btn-quality" data-q="3">3</button><button class="btn btn-outline btn-quality" data-q="4">4</button><button class="btn btn-outline btn-quality" data-q="5">5</button></div></div>`;
  }
  if(e.target.classList.contains('btn-quality')){
    const qualidade=parseInt(e.target.dataset.q,10);
    const card=filaCartoes.shift();
    await responderFlashcard({userId:auth.currentUser.uid,deckId:deckAberto,cardId:card.id,quality:qualidade});
    document.dispatchEvent(new CustomEvent('flashcardReviewed',{detail:{quality:qualidade}}));
    mostrarCartao();
  }
});

historicoDecks?.addEventListener('click',async e=>{
  const btn=e.target.closest('.btn-abrir-deck');
  if(!btn)return;
  const deckId=btn.dataset.id;
  deckAberto=deckId;
  // busca cards para revisão
  const q=query(collection(db,`users/${auth.currentUser.uid}/flashcards/${deckId}/cards`));
  const snap=await getDocs(q);
  filaCartoes=snap.docs.map(d=>({id:d.id,...d.data()})).filter(c=>!c.nextReview||c.nextReview.toDate()<=new Date());
  if(filaCartoes.length===0){showToast('Nenhum cartão para revisar hoje','info');return;}
  estudoContainer.style.display='block';
  estudoContainer.scrollIntoView({behavior:'smooth'});
  mostrarCartao();
}); 