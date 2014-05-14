/**
 * メインロジック
 */

//=============================================================================
// init.jsで変更可能な設定値
//=============================================================================

//省略時のデフォルト値の定義
CAT_URL=(CAT_URL?CAT_URL:"/debug_proxy/issue_categories.json.php");//debug
ISSU_URL=(ISSU_URL?ISSU_URL:"/debug_proxy/issues.json.php");//debug
ISSU_LIMIT=(ISSU_LIMIT?ISSU_LIMIT:100);//1回のリクエスト件数の上限
ZOOM_LEVEL=(ZOOM_LEVEL?ZOOM_LEVEL:15);
MAXZOOM=(MAXZOOM?MAXZOOM:19);
MINZOOM=(MINZOOM?MINZOOM:8);
DEFAULT_LAT=(DEFAULT_LAT?DEFAULT_LAT:35.66061106147289);
DEFAULT_LNG=(DEFAULT_LNG?DEFAULT_LNG:139.7805888205567);
TWEET_FORMAT=(TWEET_FORMAT?TWEET_FORMAT:'@testposterdone <$subject$> #テストポスター祭り #testhash');
GPS_AUTO_SEARCH=(GPS_AUTO_SEARCH?GPS_AUTO_SEARCH:true);//GPS追尾時で地図ドラッグ時に自動的に近くのポスターを検索
GPS_AUTO_POS_CLEAR=(GPS_AUTO_POS_CLEAR?GPS_AUTO_POS_CLEAR:false);//GPS追尾時で地図ドラッグ時に以前のポスターを消去する
GPS_AUTO_POS_INFO_COUNT=(GPS_AUTO_POS_INFO_COUNT?GPS_AUTO_POS_INFO_COUNT:false);//GPS追尾時で地図ドラッグ時に掲示板の件数をカウントする
SEND_TW_POS_DATA_BACK_POST=(SEND_TW_POS_DATA_BACK_POST?SEND_TW_POS_DATA_BACK_POST:false);//twitter共有時にバックグラウンドで別のアドレスに掲示板データを投げる
POS_DATA_REV_URL=(POS_DATA_REV_URL?POS_DATA_REV_URL:'test_rev.php');//twitter共有時にバックグラウンドで掲示板データを投げるアドレス（send_tw_pos_data_back_post）有効時


//=============================================================================
// 内部固定の設定値
//=============================================================================
MAKER_CASH_MAX_LEN=400;//リークを防ぐ為、一定数以上溜まるとマーカーを強制消去する閾値
//ステータスの種類　id:ステータスID ico:左上アイコン画像 name:ステータスのプルダウンに表示する名称
STATUS_DATA_LIST={
    1:{ico:"js/marker_r.png",name:"未貼付"},
    5:{ico:"js/marker_b.png",name:"貼付完了"},
    99:{ico:"js/marker_g.png",name:"その他"}
}

NAVI_CON_APPNAME='AUaH70rv';//NaviCon連携スキーマの登録ID  アプリ(登録URL毎)に申請（https://github.com/open-election/BoardMap）
GEO_AUTO_LOAD_BETWEEN=250;//MAP移動時にどの程度移動すれば、掲示板情報を再検索するか(メートル)
GEO_MAXIMUMAGE=10000;//GPSの定期的な取得間隔(ms)　GEO_TIMEOUTより大きい値　端末のバッテリー消費に影響
GEO_TIMEOUT=10000;//GPSのタイムアウト(ms) 精度に影響


//=============================================================================
// エントリーポイント
//=============================================================================
var currentInfoWindow;
var APP;//kendo UI
var user_settings;//UIから変更可能な各種ユーザー設定値
var map;
var m_map_data_manager;
var geocoder;
var geo_watch_id=0;
var dragend_old_latlng;//GEO_AUTO_LOAD_BETWEENの移動量判定用
var gps_tracking_mode=false;//GPS追尾モードかのフラグ
var gps_accuracy=0;//最後に取得したGPSの誤差

document.ontouchmove = function(event){//スマホでBGがバウンドするのを禁止
    event.preventDefault();
}
$(function() {

    //-----------------------------
    //動作環境をチェック　動作環境はchromeとsafariのみ。それ以外は起動しない
    //-----------------------------

    var ua=navigator.userAgent.toLocaleLowerCase();
    var checker=false;
    var addhtml="";
    if(ua.indexOf("android")!=-1){//android
        checker=(ua.indexOf("chrome")!=-1);//androidはchromeのみ
        addhtml='<br/><a href="https://play.google.com/store/apps/details?id=com.android.chrome&hl=ja"><img alt="" src="/img/google_play.jpg"></a>';
      //  alert("android "+checker);
    }else if(ua.indexOf("iphone")!=-1||ua.indexOf("ipad")!=-1||ua.indexOf("ipod")!=-1){//ios
        checker=(ua.indexOf("safari")!=-1 && ua.indexOf("mobile")!=-1);//ipad iphone はsafariのみ（chromeは不可）
       // alert("ios "+checker);
    }else{//それ以外の端末は動作保証外だが、動くかもしれないので、safariとchromeならOKにしておく。
        checker=(ua.indexOf("safari")!=-1 || ua.indexOf("chrome")!=-1);
       // alert("other "+checker);
    }
    if(!checker){
        alert("本アプリの利用は、Chrome又はSafariをご利用下さい。");
        $('body').html('動作対象外のブラウザです<br/>本アプリの利用は、Chrome又はSafariをご利用下さい。'+addhtml);
        return;
    }

    //-----------------------------
    //kendou uiの初期化
    //-----------------------------
    APP = new kendo.mobile.Application(document.body,
        {
        loading: "<br/><h1>読み込み中</h1>",
            hideAddressBar: true//アドレスバー非表示(iosのみ)
            ,updateDocumentTitle:true
            ,hashBang:false
            //,serverNavigation:true//ajaxロード禁止
            ,skin: "flat"//指定しないと端末毎にmobileのheaderとfooterの位置が逆転した意図しないスキンが適用される
            //,initial: "#tabstrip-map"
           // ,layout: "mobile-tabstrip"
        });

    //UIにバインドする各種設定値
    user_settings = kendo.observable({
        gps_auto_search:GPS_AUTO_SEARCH,//GPS追尾時で地図ドラッグ時に自動的に近くのポスターを検索
        gps_auto_pos_clear:GPS_AUTO_POS_CLEAR,//GPS追尾時で地図ドラッグ時に以前のポスターを消去する
        gps_auto_pos_info_count:GPS_AUTO_POS_INFO_COUNT,//GPS追尾時で地図ドラッグ時に掲示板の件数をカウントする
        send_tw_pos_data_back_post:SEND_TW_POS_DATA_BACK_POST,//twitter共有時にバックグラウンドで別のアドレスに掲示板データを投げる
        send_tw_pos_data_addres:POS_DATA_REV_URL//ポスト先表示用
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
        var st_op=$('<select class="DropDownList_anime_tar" />');
        st_op.append('<option value="*" selected>全て表示</option>');
        $.each(STATUS_DATA_LIST,function(i,val){
            st_op.append('<option value="'+i+'">'+val['name']+'</option>');
        });

        //var st_op=$('<select class="DropDownList_anime_tar"><option value="open">未貼付</option><option value="close">貼付完了</option><option value="*" selected>全て表示</option></select>');
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
                search_country_pos(category_id,move_area_status);
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
       // show_load_lock();//読み込み中画面の表示
    });
    $(document).bind("on_map_data_change_after", function(){
       // hide_load_lock();//読み込み中画面の解除

    });

    //ポスター件数　データ要求中
    $(document).bind("on_map_data_requesting", function(eve,request_args){
        $("#map_data_receive_roading_img").show();
        $("#map_data_receive_roading_mark").hide();
    });

    //ポスター件数 データ要求受信中(行政区に該当する掲示板の問い合わせ 経過監視用)
    $(document).bind("on_map_data_done", function(eve,offset,total_count){
        APP.changeLoadingMessage("受信中 "+offset+"/"+total_count+"件");
    });

    //ポスター件数　データ要求完了
    $(document).bind("on_map_data_completion", function(eve){
        //件数表示集計
        var info_data;
        if(gps_tracking_mode){
            //GPS追尾で取得した場合
            if(user_settings.get("gps_auto_pos_info_count")){
                //オプション GPS追尾時で地図ドラッグ時に掲示板の件数をカウントする
                info_data= m_map_data_manager.get_load_pos_info_count();
            }else{
                info_data= m_map_data_manager.get_view_disp_pos_info_count();
            }
        }else{
            //地域選択で呼び出した場合
            //件数表示とstatusアイコンの切り替え
            info_data= m_map_data_manager.get_load_pos_info_count();
        }

        var now_cnt=info_data.now_cnt;
        //呼び出すstatusによって左のmarkerを変える
        var html="";
        for(var i in now_cnt){
            if(now_cnt[i]!=undefined){
                html+='<img src="'+STATUS_DATA_LIST[i].ico+'"/><span>'+now_cnt[i]+'</span>';
            }
        };
        html+='<span>　'+info_data.total_count+'件</span>';
        $("#map_data_receive_info").empty();
        $("#map_data_receive_info").html(html);


        $("#map_data_receive_roading_img").hide();
        $("#map_data_receive_roading_mark").show();
    });


    //データの要求失敗
    $(document).bind("on_map_data_fail", function(textStatus,responseText){
        $("#map_data_receive_roading_img").hide();
        hide_load_lock();//どこで画面ロックが使われるか分からないので、エラー時は取りあえず画面ロックを解除しておく
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

    //GMAPドラッグ移動終了　
    google.maps.event.addListener(map, 'dragend',function(){
        //ドラッグ移動終了＞画面停止イベント ドラッグ終了後の「idle」にバインド
        google.maps.event.addListenerOnce(map, 'idle', function(){
            //オプション　GPS追尾時で地図ドラッグ時に以前のポスターを消去する
            if(user_settings.get("gps_auto_pos_clear")){
                m_map_data_manager.map_data_clear();
            }
            //オプション　GPS自動追尾時は地図のドラッグ時に、地図の中心位置から近くの掲示板を取得
            if(gps_tracking_mode && user_settings.get("gps_auto_search")){

                var now_latlng=map.getCenter();
                //GEO_AUTO_LOAD_BETWEENで指定した以上の距離の移動があれば、掲示板情報を再検索
                if(google.maps.geometry.spherical.computeDistanceBetween(dragend_old_latlng ,now_latlng)>=GEO_AUTO_LOAD_BETWEEN){
                    m_map_data_manager.set_status('*');
                    m_map_data_manager.set_location([now_latlng.lat(),now_latlng.lng()]);
                    m_map_data_manager.load_nearby_data(function(){
                        dragend_old_latlng=now_latlng;
                    });
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

    //twitter連携
    //ポップアップブロック回避する為に、twitterのリンクurlを直接バインドor href設定
    var tw_uri='';
    var tw_uri='https://twitter.com/intent/tweet?text='+ encodeURIComponent(TWEET_FORMAT.replace('<$subject$>',subject)) + '&url=null';
    if(('ontouchend' in window)){
        //mobile
        send_twitter_jq.unbind("touchend");
        send_twitter_jq.bind("touchend", function(e){
            window.open(tw_uri);
        });

    }else{
        //PC
        send_twitter_jq.attr('href',tw_uri);
    }
    //twitterポスト時にバックで任意のアドレスへ掲示板データを投げる（自動集計機能）
    if(user_settings.get("send_tw_pos_data_back_post")){
        var msd=('ontouchend' in window)?'touchend':'click';
        send_twitter_jq.bind(msd, function(e){
            $.ajax({
                type: "GET",
                url: POS_DATA_REV_URL,
                data: {data:poster_data.id+','+subject},
                //dataType: 'jsonp',
               error:function(e) {
                   alert( "送信エラー: " +POS_DATA_REV_URL+' '+ e.status+':'+ e.statusText);
               }
            });
        });
    };

    //掲示板が座標を保持しているか確認
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
            var scm='navicon.denso.co.jp/setPOI?ver=1.4&ll='+encodeURIComponent(lat_lng)+'&appName='+NAVI_CON_APPNAME;
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
    stop_geo_pos_watch();
  var addre=$("#move_area_address").val();
   if(!geocoder){alert("geocoderエラー");return;}
    show_load_lock();
    geocoder.geocode({ 'address': addre}, function(res, st)
    {
        if (st == google.maps.GeocoderStatus.OK) {
        var location = res[0].geometry.location;
            map.panTo(location);
            dragend_old_latlng=map.getCenter();
            m_map_data_manager.set_status('*');
            m_map_data_manager.set_location([location.lat(),location.lng()]);
            m_map_data_manager.load_nearby_data(function(){
                hide_load_lock();
                m_map_data_manager.set_current_map_position();//表示後に全体を表示出来るサイズにズーム
            });
            strip_tab_to('tabstrip-map');
    }else if(st ==google.maps.GeocoderStatus.INVALID_REQUEST||st ==google.maps.GeocoderStatus.ZERO_RESULTS){
      alert("入力した住所では場所が特定出来ませんでした。\n入力した住所に間違いが無いか確認して下さい。\nまた市区町村は必ず入れて下さい。");
            hide_load_lock();
        }else{
      alert("サーバーに接続出来ません。時間をあけてから検索してみて下さい："+st);
            hide_load_lock();
    }

  });

}
/**
 * 行政区と掲示板のステータスを指定して表示
 */
function search_country_pos(category_id,status,cb){
    stop_geo_pos_watch();//地域選択時は自動追尾を停止
    if(!category_id){return;}
        show_load_lock();
        m_map_data_manager.map_data_clear();
        m_map_data_manager.set_category_ids([category_id]);
        m_map_data_manager.set_status(status);
        m_map_data_manager.load_data(function(){
            m_map_data_manager.set_current_map_position();//表示後に全体を表示出来るサイズにズーム
            hide_load_lock();
        });
    }
/**
 * GPSで現在位置の地図を表示し、その付近のステータスが「完了と未完了」のポスターを表示
 */
function search_geo_pos(){
    show_load_lock();
    navigator.geolocation.getCurrentPosition(function(pos) {
           // console.log("誤差 "+pos.coords.accuracy);
        gps_accuracy=pos.coords.accuracy;
        m_map_data_manager.map_data_clear();
        map.panTo(new google.maps.LatLng(pos.coords.latitude,pos.coords.longitude));
        dragend_old_latlng=map.getCenter();
        m_map_data_manager.set_nowposition_marker(pos.coords)//現在位置にマーク描画
            //ポスター検索
            m_map_data_manager.set_status('*');
            m_map_data_manager.set_location([pos.coords.latitude,pos.coords.longitude]);
            m_map_data_manager.load_nearby_data(function(){
                m_map_data_manager.set_current_map_position();//表示後に全体を表示出来るサイズにズーム
                hide_load_lock();
            });
    }, function(e) {
            hide_load_lock();
        alert(get_geolocation_err_msg(e.code));//+ e.message
        stop_geo_pos_watch();
    },
        {enableHighAccuracy:true,timeout:GEO_TIMEOUT}
    );
}
/**
 * GPS連動マップモード
 * GPS定期的に監視し、現在位置を描画
 */
function search_geo_pos_watch(){
    var old_latlng=m_map_data_manager.get_nowposition_marker();
    if (navigator.geolocation) {
        //既にONの時は現在位置に戻る処理（停止は無し）
        if(geo_watch_id){
            //todo::GPSの誤差が大きい場合(wifi等)再取得する
           // stop_geo_pos_watch();
            var now_latlng=m_map_data_manager.get_nowposition_marker();
            map.panTo(now_latlng);
            m_map_data_manager.set_location([now_latlng.lat(),now_latlng.lng()]);
            m_map_data_manager.load_nearby_data(function(){
                old_latlng=now_latlng;
            });
            return;
        }else{
            user_settings.set('gps_tracking_mode',true);
            //初回のみ処理（初期化処理）
            search_geo_pos();
            gps_tracking_mode=true;
           $("#search_geo_pos_watch-btn").addClass('selected');
        }
        geo_watch_id= navigator.geolocation.watchPosition(function(pos) {
                gps_accuracy=pos.coords.accuracy;
                  //  console.log("誤差 "+pos.coords.accuracy);
                var now_latlng=new google.maps.LatLng(pos.coords.latitude,pos.coords.longitude);
                m_map_data_manager.set_nowposition_marker(pos.coords);//現在位置にマーク描画
                //----------------------------------------------------------------------------
                //  geo_watch_auto_load_betweenで設定した距離以上を移動したら、掲示板を再検索する
                //  computeDistanceBetween(from,to) 2点間の距離算出 使用にはAPIの読み込み時に引数「libraries=geometry」追加する
                //----------------------------------------------------------------------------
               //console.log("distans "+google.maps.geometry.spherical.computeDistanceBetween(old_latlng ,now_latlng));
                if(google.maps.geometry.spherical.computeDistanceBetween(old_latlng ,now_latlng)>=GEO_AUTO_LOAD_BETWEEN){
                    map.panTo(now_latlng);
                    dragend_old_latlng=map.getCenter();
                    //ポスター検索
                    m_map_data_manager.set_status('*');
                    m_map_data_manager.set_location([now_latlng.lat(),now_latlng.lng()]);
                    m_map_data_manager.load_nearby_data(function(){
                        old_latlng=now_latlng;
                    });
                }
            },
            function(e) {
                alert(get_geolocation_err_msg(e.code));
                stop_geo_pos_watch();
            },
            {enableHighAccuracy:true,timeout:GEO_TIMEOUT,maximumAge:GEO_MAXIMUMAGE}
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
        gps_tracking_mode=false;
        navigator.geolocation.clearWatch(geo_watch_id);
        geo_watch_id=0;
        $("#search_geo_pos_watch-btn").removeClass('selected');
        return;
    }
}
/**
 * 選択した行政区のリストから、行政区に該当する掲示板(全てのステータス)の問い合わせ
 */
function search_countrys_poster(){

    var opl=$('#area_list');
    var ids=[];
    $(':checked',opl).each(function(){
        ids.push($(this).val());
    });
    if(ids.length>100){
        alert("選択は5件以内にして下さい");
        return;
    }
    stop_geo_pos_watch();
    show_load_lock();
    m_map_data_manager.map_data_clear();
    m_map_data_manager.set_category_ids(ids);
    m_map_data_manager.set_status('*');
    m_map_data_manager.load_data(function(){
        m_map_data_manager.set_current_map_position();//表示後に全体を表示出来るサイズにズーム
        hide_load_lock();
    });

    strip_tab_to('tabstrip-map');
}
/**
 * 現在の地図の中心位置から近くの掲示板を取得
 * ステータスが「完了と未完了」のポスターを表示
 */
function load_now_mappos_data(){
    stop_geo_pos_watch();
    show_load_lock();
    var latlng=  map.getCenter();
    m_map_data_manager.map_data_clear();
    m_map_data_manager.set_status('*');
    m_map_data_manager.set_location([latlng.lat(),latlng.lng()]);
    m_map_data_manager.load_nearby_data(function(){
        hide_load_lock();
    });
    strip_tab_to('tabstrip-map');
}

/**
 * 読み込み中画面の表示・非表示
 */
function show_load_lock(){
    APP.changeLoadingMessage("読み込み中");
    APP.pane.loader.show();
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
