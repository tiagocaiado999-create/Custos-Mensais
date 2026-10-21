// Se a API responder "sem sessão" (401), vai para a página de entrada e volta depois ao sítio onde estavas.
// Os dados por enviar ficam guardados neste dispositivo e seguem depois de entrares.
(function(){
  var original = window.fetch;
  window.fetch = function(input, init){
    return original.call(this, input, init).then(function(r){
      try{
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        if(r.status === 401 && url.indexOf('/api/') !== -1 && url.indexOf('/api/login') === -1){
          location.href = '/login.html?volta=' + encodeURIComponent(location.pathname + location.search);
        }
      }catch(e){}
      return r;
    });
  };
})();
