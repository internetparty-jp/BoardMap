//=============================================================================
// エントリーポイント
//=============================================================================
var currentInfoWindow;
var APP;//kendo UI
var observable;//kendo UI bind val
var user_settings;//UIから変更可能な各種ユーザー設定値
var map;
var m_map_data_manager;
var geocoder;
var geo_watch_id=0;
var geo_auto_load_between=300;//MAP移動時にどの程度移動すれば、掲示板情報を再検索するか(メートル)
var geo_maximumAge=10000;//GPSの定期的な取得間隔(ms)　geo_timeoutより大きい値　端末のバッテリー消費に影響
var geo_timeout=10000;//GPSのタイムアウト(ms)
var navi_con_appName='AUaH70rv';//NaviCon連携スキーマの登録ID  アプリ(登録URL毎)に申請（https://github.com/open-election/BoardMap）
var dragend_old_latlng;//geo_auto_load_betweenの移動量判定用

document.ontouchmove = function(event){
    event.preventDefault();
}

$(function() {


    APP = new kendo.mobile.Application(document.body,
        {
        loading: "<br/><h1>読み込み中</h1>",
            hideAddressBar: true//アドレスバー非表示(iosのみ)
            ,hashBang:false
            //,serverNavigation:true//ajaxロード禁止
            ,skin: "flat"//指定しないと端末毎にmobileのheaderとfooterの位置が逆転した意図しないスキンが適用される
            //,initial: "#tabstrip-map"
           // ,layout: "mobile-tabstrip"
        });

    //UIにバインドする各種設定値
    user_settings = kendo.observable({
        gps_auto_search:true//地図ドラッグ時に自動的に近くのポスターを検索
    });

    kendo.bind($("span"), user_settings);
    kendo.bind($("input"), user_settings);

    //mapの初期化
    initialize(DEFAULT_LAT,DEFAULT_LNG,MINZOOM);
});

//=============================================================================
// 初期化　
//=============================================================================
function initialize(plat,plng,zoom) {
  //マップ・データオブジェクトの初期化
  var myOptions = {
    zoom: zoom,
    center: new google.maps.LatLng(plat,plng),
    mapTypeId: google.maps.MapTypeId.ROADMAP,
    //disableDoubleClickZoom:true,//ダブルクリックによるズームと中央揃えを無効
    maxZoom:MAXZOOM,
    minZoom:MINZOOM,
        //Gmapのボタン位置
        mapTypeControl: false,
        mapTypeControlOptions: {
            style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
            position: google.maps.ControlPosition.BOTTOM_CENTER
        },
        panControl: false,
       /* panControlOptions: {
            position: google.maps.ControlPosition.TOP_RIGHT
        },*/
        zoomControl: true,
        zoomControlOptions: {
            style: google.maps.ZoomControlStyle.LARGE,
            position: google.maps.ControlPosition.RIGHT_BOTTOM
        },
        scaleControl: false,
        /*scaleControlOptions: {
            position: google.maps.ControlPosition.TOP_LEFT
        },*/
        streetViewControl: true,
        streetViewControlOptions: {
            position: google.maps.ControlPosition.TOP_LEFT
        }
  };
  map = new google.maps.Map(document.getElementById('map_canvas'), myOptions);
  dragend_old_latlng=map.getCenter();
  geocoder = new google.maps.Geocoder();//ジオコーダー
  $(document).m_map_data_manager({map:map});//データ管理OBJ
  m_map_data_manager=$(document).data('m_map_data_manager');

    $.getJSON(CAT_URL,{}, cb);
    function cb(d){
        if(!d.issue_categories){return;}
        m_map_data_manager.set_issue_categories(d.issue_categories);
        //行政区の移動 リスト版////////
       var opl=$('<ul />');
        $.each(d.issue_categories,function(i,val){
           opl.append('<li><label>'+val['name']+'<input type="checkbox" value="'+val['id']+'" /></label></li>');
        });
        $('#area_list').append(opl);
        //$('#area_list input').kendoMobileSwitch();
        //kendo.init($('#area_list'));
        //地域選択のプルダウン生成////////////
        //ステータス
        var st_op=$('<select class="DropDownList_anime_tar"><option value="open">未貼付</option><option value="close">貼付完了</option><option value="*" selected>全て表示</option></select>');
        //行政区
        var ct_op=$('<select class="DropDownList_anime_tar" />');
        if(!d.issue_categories){return;}
        var g=d.issue_categories;
        ct_op.append('<option value="">地域を選択</option>');
        $.each(g,function(i,val){
            ct_op.append('<option value="'+val['id']+'">'+val['name']+'</option>');
        });

        ///変更時イベント
        $.each([st_op,ct_op],function(i,val){
            val.bind("change",function(eve){
                var category_id= ct_op.val();
                var move_area_status=st_op.val();
                stop_geo_pos_watch();//地域選択時は自動追尾を停止
                search_country_pos(category_id,move_area_status,function(){
                    m_map_data_manager.set_current_map_position();//表示後に全体を表示出来るサイズにズーム
                });
            });
        });
        $('#move_area_status').empty().append(st_op);
        $('#move_area_distince').empty().append(ct_op);

        //ドロップタウンUI生成
        if (kendo.ui.DropDownList) {
            var body = $(".km-pane");
            $.each([st_op,ct_op],function(i,val){
                val.kendoDropDownList({
                    popup: { appendTo: body },
                    animation: { open: { effects: body.hasClass("km-android") ? "fadeIn" : body.hasClass("km-ios") || body.hasClass("km-wp") ? "slideIn:up" : "slideIn:down" } }
                });
            });
        }

        //////////
       // resize_gmap();//GMAPのリサイズ
       // search_geo_pos();//起動時に、GPSで現在位置の地図と、付近のポスターを表示
    }

    //=============================================================================
    // イベントバインド
    //=============================================================================

    //ウインドウリサイズ完了
    var timer = null;
    $(window).bind("resize",function(){
        if (timer){clearTimeout(timer);};
      timer = setTimeout(resize_gmap, 500);
    });

    //地図データ変更完了時処理
    $(document).bind("on_map_data_change_befor", function(){
        show_load_lock();//読み込み中画面の表示
    });
    $(document).bind("on_map_data_change_after", function(){
        hide_load_lock();//読み込み中画面の解除

    });

    //ポスター件数受信時
    $(document).bind("on_map_data_receive_info", function(eve,request_args,status_info){
        //件数表示とstatusアイコンの切り替え
        var info_data= m_map_data_manager.get_load_record_info();
        now_cnt=info_data.now_cnt;
        //呼び出すstatusによって左のmarkerを変える
        ico={1:"js/marker_r.png",5:"js/marker_b.png",99:"marker_g.png"};
        var html="";
        for(var i in now_cnt){
            html+='<img src="'+ico[i]+'"/><span>'+now_cnt[i]+'</span>';
        };
        html+='<span>/'+info_data.total_count+'件</span>';
        $("#map_data_receive_info").empty();
        $("#map_data_receive_info").html(html);
    });
    //ポスター件数　データ要求中
    $(document).bind("on_map_data_requesting", function(eve,request_args){
        $("#map_data_receive_roading_img").show();
        $("#map_data_receive_roading_mark").hide();
    });
    //ポスター件数　データ要求完了
    $(document).bind("on_map_data_completion", function(eve){
        $("#map_data_receive_roading_img").hide();
        $("#map_data_receive_roading_mark").show();
    });
    //GMAPのマーカーの共有ボタン押下
    $(document).bind("on_maker_commbtn_click", function(eve,poster_data){
        open_map_common_actions($("#map-common-actions"),poster_data);
    });
    //センター移動
    //google.maps.event.addListener(map, 'center_changed', function() {})

    //GMAP余白クリック
    google.maps.event.addListener(map, 'click', function() {
        //吹き出しを閉じる
        if(currentInfoWindow){
            currentInfoWindow.close();
        }
    })

    //GMAPズーム変更
    google.maps.event.addListener(map, 'zoom_changed', function(){
     //  console.log(map.getZoom());
    });

   /* //GMAPドラッグ移動開始
    var dragstart_latlng;
    google.maps.event.addListener(map, 'dragstart',function(){
        dragstart_latlng=map.getCenter();

    });*/
    //GMAPドラッグ移動終了　
    google.maps.event.addListener(map, 'dragend',function(){
        //ドラッグ移動終了＞画面停止イベント ドラッグ終了後の「idle」にバインド
        google.maps.event.addListenerOnce(map, 'idle', function(){
            //GPS自動追尾時は、地図のドラッグ時に、地図の中心位置から近くの掲示板を取得
            if(geo_watch_id && user_settings.gps_auto_search){

                var now_latlng=map.getCenter();
                //geo_auto_load_betweenで指定した以上の距離の移動があれば、掲示板情報を再検索
                if(google.maps.geometry.spherical.computeDistanceBetween(dragend_old_latlng ,now_latlng)>=geo_auto_load_between){
                    load_now_mappos_data();
                    dragend_old_latlng=now_latlng;
                }
            }else{
                dragend_old_latlng=map.getCenter();
            };
        });
    });
    //APP初期化完了時イベント
    google.maps.event.addListener(map, 'projection_changed', function(){
        google.maps.event.addListenerOnce(map, 'tilesloaded', function(){
                //
        });
    });

  ////コンテンツ初期化//////////////////////////////////////////
//resize_gmap();

}

//=============================================================================
// イベント処理
//=============================================================================
/**
 * 画面リサイズ時のGMAP配置計算
 */
function resize_gmap(){
  //GMAP配置計算
   $("#map_canvas").css({width:$('#content-map_wrap').width(),height:$('#content-map_wrap').height()});
    google.maps.event.trigger(map, 'resize');
}


//=============================================================================
// ボタン操作用
//=============================================================================

/**
 * タブの切り替え
 * @param tra_jq
 * @param poster_data
 */
function strip_tab_to(addr){
    var router = new kendo.Router();
    router.start();
    router.navigate(addr);
    APP.view().header.find("#layout_tabstrip").data("kendoMobileTabStrip").switchTo(addr);
}
/**
 * 掲示板＞共有　open時
 */
function open_map_common_actions(tra_jq,poster_data){
    if(!poster_data){return;}
    var send_twitter_jq=$('.send_twitter',tra_jq);
    var send_nav_code_jq=$('.send_nav_code',tra_jq);
    var subject=poster_data.subject;

    //ポップアップブロック回避する為に、twitterのリンクurlを直接バインドor href設定
    var tw_uri='';
    var tw_uri='https://twitter.com/intent/tweet?text='+ encodeURIComponent(TWEET_FORMAT.replace('<$subject$>',subject)) + '&url=null';
    if(('ontouchend' in window)){
        send_twitter_jq.unbind("touchend");
        send_twitter_jq.bind("touchend", function(e){
            window.open(tw_uri);
        });
    }else{
        send_twitter_jq.attr('href',tw_uri);
    }
    var ini_ll=eval("a="+poster_data.geometry);
    var lat_lng;
    if(ini_ll){
        lat_lng=Array.isArray(ini_ll.coordinates)?ini_ll.coordinates[1]+','+ini_ll.coordinates[0]:false;
    }
    if(!lat_lng){return};

    //navcon連携 モバイルのみ
    if(('ontouchend' in window)){
        send_nav_code_jq.unbind("touchend");
        send_nav_code_jq.bind("touchend", function(e){
            //スキーム生成
            var scm='navicon.denso.co.jp/setPOI?ver=1.4&ll='+encodeURIComponent(lat_lng)+'&appName='+navi_con_appName;
            //アプリの検出　ex) http://qiita.com/ooyabuh/items/388ffb0427b2772a9c66
            if (is_app_store()=="android") {
                location.href='intent://'+scm+'#Intent;scheme=navicon;package=jp.co.denso.navicon.view;end';
            } else if (is_app_store()=="ios") {
                //launch_frame.location.href='navicon://'+scm+'&callURL=http://';   //元アプリに戻るにはwebアプリではブラウザのurlスキームの特定が大変な為、却下
                launch_frame.location.href='navicon://'+scm;
                setTimeout(function(){
                    location.href= "itmss://itunes.apple.com/jp/app/navicon-kanabi-lian-xie/id368186022?mt=8";
                } , 500);
            }
        });
    }else{
        //ボタン無効
        send_nav_code_jq.data("kendoMobileButton").enable(false)
    }

    //urlスキーム経由のtwアプリ経由は端末依存が多すぎでやめ
    /*if(is_phone()){//mobile
     tw_uri='twitter://post?message='+encodeURIComponent(TWEET_FORMAT.replace('<$subject$>',subject));
     }else{
     //pc
     tw_uri='https://twitter.com/intent/tweet?text='+ encodeURIComponent(TWEET_FORMAT.replace('<$subject$>',subject)) + '&url=null';
     }*/
    // alert(tw_uri);

    //
    $("#map-common-actions").data("kendoMobileActionSheet").open($("#map-common-actions"),poster_data);
}


/**
 * 掲示板＞共有＞カーナビ転送ボタン押下
 */
function send_nav_code(d){
    var poster_data= d.context;
   var tra_jq= d.target;
    if(!poster_data){return;}
    console.log(poster_data.subject);
}
/**
 *mapのタブ表示時
 */
function layout_tabstrip_onshow(){
    setTimeout(resize_gmap, 10);//gmapをリサイズする
}
/*
 * エリアの移動（住所）
 */
function move_area_address(){
  var addre=$("#move_area_address").val();
   if(!geocoder){alert("geocoderエラー");return;}
    geocoder.geocode({ 'address': addre}, function(res, st)
    {
        if (st == google.maps.GeocoderStatus.OK) {
        var location = res[0].geometry.location;
            map.panTo(location);
            dragend_old_latlng=map.getCenter();
            search_vicinity_poster(location.lat(),location.lng(),'*',function(){
                m_map_data_manager.set_current_map_position();//表示後に全体を表示出来るサイズにズーム
            });
            strip_tab_to('tabstrip-map');
    }else if(st ==google.maps.GeocoderStatus.INVALID_REQUEST||st ==google.maps.GeocoderStatus.ZERO_RESULTS){
      alert("入力した住所では場所が特定出来ませんでした。\n入力した住所に間違いが無いか確認して下さい。\nまた市区町村は必ず入れて下さい。");
    }else{
      alert("サーバーに接続出来ません。時間をあけてから検索してみて下さい："+st);
    }

  });

}
/**
 * 行政区と掲示板のステータスを指定して表示
 */
function search_country_pos(category_id,status,cb){
    if(!category_id){return;}
        m_map_data_manager.map_data_clear();
        m_map_data_manager.set_category_ids([category_id]);
        m_map_data_manager.set_status(status);
        m_map_data_manager.load_data(cb);
    }
/**
 * GPSで現在位置の地図を表示し、その付近のステータスが「完了と未完了」のポスターを表示
 */
function search_geo_pos(){
    show_load_lock();
    navigator.geolocation.getCurrentPosition(function(pos) {
        map.panTo(new google.maps.LatLng(pos.coords.latitude,pos.coords.longitude));
        dragend_old_latlng=map.getCenter();
        m_map_data_manager.set_nowposition_marker(pos.coords)//現在位置にマーク描画
        search_vicinity_poster(pos.coords.latitude,pos.coords.longitude,'*');//ポスター検索
    }, function(e) {
            hide_load_lock();
        alert(get_geolocation_err_msg(e.code));//+ e.message
        stop_geo_pos_watch();
    },
        {enableHighAccuracy:true,timeout:geo_timeout}
    );
}
/**
 * GPS連動マップモード
 * GPS定期的に監視し、現在位置を描画
 */
function search_geo_pos_watch(){
    var old_latlng=m_map_data_manager.get_nowposition_marker();
    if (navigator.geolocation) {
        //トグル処理
        if(geo_watch_id){
            stop_geo_pos_watch();
            return;
        }else{
            //初回のみ処理（初期化処理）
            search_geo_pos();
            //$("#search_geo_pos_watch-btn").css({'background-color':'#C7E7FD'});//無理矢理
            $("#search_geo_pos_watch-btn").addClass('selected');
        }

        geo_watch_id= navigator.geolocation.watchPosition(function(pos) {
                var now_latlng=new google.maps.LatLng(pos.coords.latitude,pos.coords.longitude);
                m_map_data_manager.set_nowposition_marker(pos.coords);//現在位置にマーク描画
                //----------------------------------------------------------------------------
                //  geo_watch_auto_load_betweenで設定した距離以上を移動したら、掲示板を再検索する
                //  computeDistanceBetween(from,to) 2点間の距離算出 使用にはAPIの読み込み時に引数「libraries=geometry」追加する
                //----------------------------------------------------------------------------
               //console.log("distans "+google.maps.geometry.spherical.computeDistanceBetween(old_latlng ,now_latlng));
                if(google.maps.geometry.spherical.computeDistanceBetween(old_latlng ,now_latlng)>=geo_auto_load_between){
                    map.panTo(now_latlng);
                    dragend_old_latlng=map.getCenter();
                    search_vicinity_poster(now_latlng.lat(),now_latlng.lng(),'*');//ポスター検索
                    old_latlng=now_latlng;
                }
            },
            function(e) {
                alert(get_geolocation_err_msg(e.code));
                stop_geo_pos_watch();
            },
            {enableHighAccuracy:true,timeout:geo_timeout,maximumAge:geo_maximumAge}
        );
    }else{
        window.alert('ご利用の端末では位置情報に対応していません。');
    }
}

/**
 * GPS監視の停止
 */
function stop_geo_pos_watch(){
    if(geo_watch_id){
        navigator.geolocation.clearWatch(geo_watch_id);
        geo_watch_id=0;
        //$("#search_geo_pos_watch-btn").css({'background-color':''});//$("#search_geo_pos_watch-btn").removeClass("km-state-active");
        $("#search_geo_pos_watch-btn").removeClass('selected');
        return;
    }
}
/**
 * 選択した行政区のリストを生成し、行政区に該当する掲示板(全てのステータス)の問い合わせ
 */
function search_countrys_poster(){
    var opl=$('#area_list');
    var ids=[];
    $(':checked',opl).each(function(){
        ids.push($(this).val());
    });
    if(ids.length>5){
        alert("選択は5件以内にして下さい");
        return;
    }
    m_map_data_manager.map_data_clear();
    m_map_data_manager.set_category_ids(ids);
    m_map_data_manager.set_status('*');
    m_map_data_manager.load_data(function(){
        m_map_data_manager.set_current_map_position();//表示後に全体を表示出来るサイズにズーム
    });

    strip_tab_to('tabstrip-map');
}
/**
 * 現在の地図の中心位置から近くの掲示板を取得
 * ステータスが「完了と未完了」のポスターを表示
 */
function load_now_mappos_data(){
    var latlng=  map.getCenter();
    search_vicinity_poster(latlng.lat(),latlng.lng(),'*',function(){

    });
    strip_tab_to('tabstrip-map');
}

/**
 *指定した座標の付近の掲示板の検索
 * @param lat
 * @param lng
 * @param status 省略時は以前に設定した値を継承
 */
function search_vicinity_poster(lat,lng,status,cb){
    hide_load_lock();
    m_map_data_manager.map_data_clear();
    if(status){
        m_map_data_manager.set_status(status);
    }
    m_map_data_manager.set_location([lat,lng]);
    m_map_data_manager.load_nearby_data(cb);
}


/**
 * 読み込み中画面の表示・非表示
 */
function show_load_lock(){
    //todo:: tabstrip-map内のloaderの表示
    APP.pane.loader.show(); //show loading animation
}
function hide_load_lock(){
    APP.pane.loader.hide();
}


/*
* スマホの判定 iPhoneとAndroidのみ　ipadは除外
* */
function is_phone(){
    var device = navigator.userAgent;
    device=device.toLocaleLowerCase();
    //    return ((device.indexOf('iPhone') >0)|| (device.indexOf('iPad')>0)|| (device.indexOf('iPod') >0) || (device.indexOf('Android') >0));
    return ((device.indexOf('iphone') >-1)||  (device.indexOf('android') >-1));
}
/**
 * アプリのストアーのタイプ return android ios
 */
function is_app_store(){
    var device = navigator.userAgent;
    device=device.toLocaleLowerCase();
    if (device.indexOf("android") > -1) {
        return "android";
    } else if (device.search(/iphone|ipad|ipod/) > -1) {
        return "ios";
    }else{
        return;
    }
}

/**
 * GPSのエラー取得
 */
function get_geolocation_err_msg(int){
    var ms= ['0','GPSの取得を許可されていません','GPSの取得に失敗しました','GPSを取得中にタイムアウトしました'];
    return (ms[int]?ms[int]:'GPSの取得に失敗しました');
}
