import React, { useState, useEffect } from 'react';
import { Notification, Balloon } from '@alifd/next';
import MenuCard from '@/components/MenuCard';
import { IProjectField } from '@/types';
import { targets, webAppTypes, miniAppTypes } from './config';
import styles from './index.module.scss';

interface IScaffoldTypeForm {
  value: IProjectField;
  onChange: (value: object) => void;
}

const RaxScaffoldTypeForm: React.FC<IScaffoldTypeForm> = ({ value, onChange }) => {
  const [selectedTargets, setSelectedTargets] = useState([targets[0].type]);
  const [selectedWebAppType, setSelectedWebAppType] = useState(webAppTypes[0].type);
  const [selectedMiniAppType, setSelectedMiniAppType] = useState(miniAppTypes[0].type);
  /**
   * 选择 Rax 应用的 Target 
   */
  const onTargetClick = (target) => {
    const ejsOptions: any = { ...value.ejsOptions };

    const targetIndex = selectedTargets.findIndex(item => target.type === item);
    if (targetIndex > -1) {
      if (selectedTargets.length === 1) {
        Notification.error({ content: '请至少选择一个 Target' })
        return;
      }
      // 删除已有的 target
      selectedTargets.splice(targetIndex, 1);

      if (target.type === 'web') {
        delete ejsOptions.mpa;
      } else if (selectedTargets.length === 1) {
        delete ejsOptions.miniappType;
      }
    } else {
      if (target.type === 'web') {
        setSelectedWebAppType(webAppTypes[0].type);
        ejsOptions.mpa = webAppTypes[0].type === 'mpa';
      } else if (!selectedTargets.some(target => target === 'miniapp' || target === 'wechat-miniprogram' || target === 'kraken')) {
        setSelectedMiniAppType(miniAppTypes[0].type);
        ejsOptions.miniappType = miniAppTypes[0].type;
      }
      selectedTargets.push(target.type);
    }
    const newSelectedTargets = [...selectedTargets];
    setSelectedTargets(newSelectedTargets);

    onChange({ ejsOptions: { ...ejsOptions, targets: newSelectedTargets } });
  }
  /**
   * 选择 web 应用类型: mpa or spa
   */
  const onWebAppTypeClick = (webAppType) => {
    setSelectedWebAppType(webAppType.type);
    onChange({ ejsOptions: { ...value.ejsOptions, mpa: webAppType.type === 'mpa' } });
  };
  /**
   * 选择小程序构建类型
   */
  const onMiniAppTypeClick = (miniAppType) => {
    setSelectedMiniAppType(miniAppType.type);
    onChange({ ejsOptions: { ...value.ejsOptions, miniappType: miniAppType.type } });
  }

  useEffect(() => {
    // init value
    onChange({ ejsOptions: { targets: selectedTargets, mpa: selectedWebAppType === 'mpa', miniappType: selectedMiniAppType } });
  }, []);
  return (
    <div className={styles.container}>
      <div className={styles.title}>Target (至少选择一个)</div>
      <div className={styles.row}>
        {targets.map(item => {
          const selected = selectedTargets.some(selectedTarget => selectedTarget === item.type);
          return (
            <Balloon
              align='t'
              trigger={
                <MenuCard
                  key={item.type}
                  selected={selected}
                  title={item.title}
                  icon={item.icon}
                  onClick={() => onTargetClick(item)}
                />
              }
              closable={false}
              triggerType="hover"
            >
              {item.description}
            </Balloon>
          )
        })}
      </div>
      {selectedTargets.some(item => item === 'web') && (
        <>
          <div className={styles.title}>为 Web 应用选择应用类型</div>
          <div className={styles.row}>
            {webAppTypes.map(item => (
              <Balloon
                align='t'
                trigger={
                  <MenuCard
                    key={item.type}
                    style={{ width: 100, height: 36 }}
                    selected={selectedWebAppType === item.type}
                    title={item.title}
                    onClick={() => onWebAppTypeClick(item)}
                  />}
                triggerType="hover"
                closable={false}
              >
                {item.description}
              </Balloon>

            ))}
          </div>
        </>
      )}
      {selectedTargets.some(item => item === 'miniapp' || item === 'wechat-miniprogram' || item === 'kraken') && (
        <>
          <div className={styles.title}>为小程序选择构建类型</div>
          <div className={styles.row}>
            {miniAppTypes.map(item => (
              <Balloon
                align='t'
                trigger={
                  <MenuCard
                    key={item.type}
                    style={{ width: 100, height: 36 }}
                    selected={selectedMiniAppType === item.type}
                    title={item.title}
                    onClick={() => onMiniAppTypeClick(item)}
                  />}
                triggerType="hover"
                closable={false}
              >
                {item.description}
              </Balloon>

            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default RaxScaffoldTypeForm;
